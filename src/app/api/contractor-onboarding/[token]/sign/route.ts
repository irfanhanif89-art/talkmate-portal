import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateContractorAgreementPdf, formatAgreementDate } from '@/lib/generate-contractor-pdf'
import { postSignedPdfDelivery } from '@/lib/contractor-webhooks'

export const dynamic = 'force-dynamic'

const STORAGE_BUCKET = 'contractor-agreements'
const SIGNED_URL_TTL_SECONDS = 365 * 24 * 60 * 60 // 365 days

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as {
    abn?: unknown
    bank_bsb?: unknown
    bank_account_number?: unknown
    signature_consent?: unknown
  }

  if (body.signature_consent !== true) {
    return NextResponse.json({ ok: false, error: 'Signature consent is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: contractor } = await admin
    .from('contractors')
    .select('id, first_name, last_name, email, phone, abn, bank_bsb, bank_account_number, status, invite_expires_at, agreement_signed_at')
    .eq('invite_token', token)
    .maybeSingle()

  if (!contractor) return NextResponse.json({ ok: false, error: 'Invalid invite link' }, { status: 404 })
  if (contractor.agreement_signed_at) {
    return NextResponse.json({ ok: false, error: 'Agreement already signed' }, { status: 410 })
  }
  if (contractor.invite_expires_at && new Date(contractor.invite_expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: 'Invite link expired' }, { status: 410 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const now = new Date()
  const signed_at_iso = now.toISOString()

  // Persist any bank/ABN updates that came with the sign step.
  const detailUpdates: Record<string, unknown> = {}
  if ('abn' in body) detailUpdates.abn = body.abn ? String(body.abn).trim() : null
  if ('bank_bsb' in body) detailUpdates.bank_bsb = body.bank_bsb ? String(body.bank_bsb).trim() : null
  if ('bank_account_number' in body) {
    detailUpdates.bank_account_number = body.bank_account_number ? String(body.bank_account_number).trim() : null
  }
  if (Object.keys(detailUpdates).length > 0) {
    await admin.from('contractors').update(detailUpdates).eq('id', contractor.id)
  }

  // Get the active script for the agreement record + acknowledgement.
  const { data: activeScript } = await admin
    .from('sales_scripts')
    .select('id, version, activated_at, created_at')
    .eq('is_active', true)
    .maybeSingle()

  const scriptVersion = activeScript?.version ?? 'unversioned'
  const scriptDateSource = activeScript?.activated_at ?? activeScript?.created_at ?? now.toISOString()
  const scriptDate = new Date(scriptDateSource).toISOString().slice(0, 10)

  // Final ABN / bank values to embed in the PDF (post-update).
  const abnFinal = ('abn' in body) ? (detailUpdates.abn as string | null) : (contractor.abn ?? null)
  const bsbFinal = ('bank_bsb' in body) ? (detailUpdates.bank_bsb as string | null) : (contractor.bank_bsb ?? null)
  const acctFinal = ('bank_account_number' in body)
    ? (detailUpdates.bank_account_number as string | null)
    : (contractor.bank_account_number ?? null)

  // Generate the signed PDF.
  let pdfBytes: Uint8Array
  let usedTemplate = false
  try {
    const res = await generateContractorAgreementPdf({
      contractor_first_name: contractor.first_name,
      contractor_last_name: contractor.last_name,
      contractor_address: 'QLD, Australia',
      agreement_date: formatAgreementDate(now),
      contractor_email: contractor.email,
      contractor_phone: contractor.phone ?? '',
      contractor_abn: abnFinal && abnFinal.length > 0 ? abnFinal : 'Not provided - 47% withholding applies',
      contractor_bsb: bsbFinal ?? 'To be provided',
      contractor_account_number: acctFinal ?? 'To be provided',
      script_version: scriptVersion,
      script_date: scriptDate,
      signed_ip: ip,
      signed_at_iso,
    })
    pdfBytes = res.pdf
    usedTemplate = res.usedTemplate
  } catch (err) {
    console.error('[contractor-sign] PDF generation failed', err)
    return NextResponse.json({ ok: false, error: 'PDF generation failed' }, { status: 500 })
  }

  // Upload to Supabase Storage. Bucket must exist (private) - see DEPLOYMENT.md.
  const storagePath = `${contractor.id}/${signed_at_iso.replace(/[:.]/g, '-')}_signed.pdf`
  let signedUrl: string | null = null
  let storedPath: string | null = null

  // Convert to Buffer for Node-side storage upload (Supabase JS accepts ArrayBuffer/Buffer/Blob).
  const uploadPayload = Buffer.from(pdfBytes)

  const { error: uploadError } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, uploadPayload, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) {
    console.warn('[contractor-sign] PDF upload failed:', uploadError.message)
  } else {
    storedPath = storagePath
    const { data: signed } = await admin.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
    signedUrl = signed?.signedUrl ?? null
  }

  // Mark contractor as signed -> active, with signature metadata.
  const { error: updateError } = await admin
    .from('contractors')
    .update({
      status: 'active',
      agreement_signed_at: signed_at_iso,
      agreement_signed_ip: ip,
      signed_pdf_url: storedPath,
    })
    .eq('id', contractor.id)

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 })
  }

  // Insert agreement record.
  await admin.from('contractor_agreements').insert({
    contractor_id: contractor.id,
    agreement_version: '2.0',
    script_version: scriptVersion,
    script_date: scriptDate,
    signed_at: signed_at_iso,
    signed_ip: ip,
    signed_pdf_url: storedPath,
    status: 'signed',
  })

  // Record script acknowledgement (one row per active script).
  if (activeScript?.id) {
    await admin
      .from('script_acknowledgements')
      .upsert(
        {
          contractor_id: contractor.id,
          script_id: activeScript.id,
          script_version: scriptVersion,
          acknowledged_at: signed_at_iso,
          acknowledged_ip: ip,
        },
        { onConflict: 'contractor_id,script_id' }
      )
  }

  // Fire the signed-PDF webhook (best-effort).
  if (signedUrl) {
    postSignedPdfDelivery({
      contractor_id: contractor.id,
      first_name: contractor.first_name,
      last_name: contractor.last_name,
      email: contractor.email,
      signed_at: signed_at_iso,
      signed_pdf_signed_url: signedUrl,
    }).catch(() => {})
  }

  return NextResponse.json({
    ok: true,
    signed_at: signed_at_iso,
    signed_pdf_url: signedUrl,
    used_template: usedTemplate,
    storage_path: storedPath,
  })
}
