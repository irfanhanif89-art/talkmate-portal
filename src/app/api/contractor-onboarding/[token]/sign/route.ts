import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateContractorAgreementPdf, formatAgreementDate } from '@/lib/generate-contractor-pdf'
import { postSignedPdfDelivery } from '@/lib/contractor-webhooks'
import {
  notifyAdminAlert,
  notifyContractSigned,
  sendRepPortalAccessEmail,
} from '@/lib/sales-notify'
import { isValidAbnFormat, normaliseAbn } from '@/lib/abn'
import { findAuthUserByEmail } from '@/lib/find-auth-user'

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
    signature_data_url?: unknown
    signature_method?: unknown
    signature_timestamp?: unknown
  }

  if (body.signature_consent !== true) {
    return NextResponse.json({ ok: false, error: 'Signature consent is required' }, { status: 400 })
  }

  // Captured electronic signature is now required — Electronic
  // Transactions Act 2001 (Qld) compliance per the agreement.
  const signatureDataUrl = typeof body.signature_data_url === 'string' ? body.signature_data_url : ''
  if (!signatureDataUrl.startsWith('data:image/png;base64,')) {
    return NextResponse.json({ ok: false, error: 'A drawn or typed signature is required' }, { status: 400 })
  }
  const signatureMethod: 'drawn' | 'typed' =
    body.signature_method === 'typed' ? 'typed' : 'drawn'
  const signatureClientTimestamp = typeof body.signature_timestamp === 'string'
    ? body.signature_timestamp
    : null

  // ABN is mandatory and must pass the ATO checksum.
  const abnRaw = typeof body.abn === 'string' ? body.abn : ''
  const abn = normaliseAbn(abnRaw)
  if (!abn || !isValidAbnFormat(abn)) {
    return NextResponse.json(
      { ok: false, error: 'A valid 11-digit ABN is required' },
      { status: 400 },
    )
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
  const detailUpdates: Record<string, unknown> = { abn }
  if ('bank_bsb' in body) detailUpdates.bank_bsb = body.bank_bsb ? String(body.bank_bsb).trim() : null
  if ('bank_account_number' in body) {
    detailUpdates.bank_account_number = body.bank_account_number ? String(body.bank_account_number).trim() : null
  }
  await admin.from('contractors').update(detailUpdates).eq('id', contractor.id)

  // Get the active script for the agreement record + acknowledgement.
  const { data: activeScript } = await admin
    .from('sales_scripts')
    .select('id, version, activated_at, created_at')
    .eq('is_active', true)
    .maybeSingle()

  const scriptVersion = activeScript?.version ?? 'unversioned'
  const scriptDateSource = activeScript?.activated_at ?? activeScript?.created_at ?? now.toISOString()
  const scriptDate = new Date(scriptDateSource).toISOString().slice(0, 10)

  // Final bank values to embed in the PDF (post-update). ABN is the
  // validated value from above.
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
      agreement_date: formatAgreementDate(now),
      contractor_email: contractor.email,
      contractor_phone: contractor.phone ?? '',
      contractor_abn: abn,
      contractor_bsb: bsbFinal ?? 'To be provided',
      contractor_account_number: acctFinal ?? 'To be provided',
      script_version: scriptVersion,
      script_date: scriptDate,
      signed_ip: ip,
      signed_at_iso,
      signature_data_url: signatureDataUrl,
      signature_method: signatureMethod,
    })
    pdfBytes = res.pdf
    usedTemplate = res.usedTemplate
  } catch (err) {
    console.error('[contractor-sign] PDF generation failed', err)
    return NextResponse.json({ ok: false, error: 'PDF generation failed' }, { status: 500 })
  }

  // Upload to Supabase Storage. Bucket must exist (private) - see DEPLOYMENT.md.
  // Hard-fail on upload errors: the contractor is not marked active and the
  // client receives a 500 so they can retry. Nothing downstream runs.
  const storagePath = `${contractor.id}/${signed_at_iso.replace(/[:.]/g, '-')}_signed.pdf`
  const fullName = `${contractor.first_name} ${contractor.last_name}`.trim()

  const uploadPayload = Buffer.from(pdfBytes)

  const { error: uploadError } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, uploadPayload, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) {
    console.error('[contractor-sign] PDF upload failed:', uploadError.message)
    notifyAdminAlert(
      `⚠️ Contractor PDF upload failed for ${fullName} (${contractor.email}). Signing blocked. Error: ${uploadError.message}`,
    ).catch(() => {})
    return NextResponse.json(
      { ok: false, error: 'Failed to store signed agreement. Please try again.' },
      { status: 500 },
    )
  }

  const storedPath = storagePath
  const { data: signedUrlData } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
  const signedUrl: string | null = signedUrlData?.signedUrl ?? null

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

  // Admin Telegram alert — the rep has signed, no manual action needed
  // but Irfan likes a live signal.
  notifyContractSigned({
    repName: fullName,
    signedAt: new Date().toISOString(),
  }).catch(() => {})

  // Insert agreement record with signature metadata (migration 041).
  await admin.from('contractor_agreements').insert({
    contractor_id: contractor.id,
    agreement_version: '2.0',
    script_version: scriptVersion,
    script_date: scriptDate,
    signed_at: signed_at_iso,
    signed_ip: ip,
    signed_pdf_url: storedPath,
    status: 'signed',
    signature_method: signatureMethod,
    signature_timestamp: signatureClientTimestamp,
    ip_address: ip,
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

  // Auto-provision sales rep portal access (Session 25). Best-effort —
  // failures are logged + alerted but never block the signing response.
  // The contractor is already marked active above; this only adds portal
  // access on top.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.talkmate.com.au'
  const dashboardUrl = `${appUrl.replace(/\/$/, '')}/sales/dashboard`
  try {
    let authUserId: string | null = null
    let linkedExistingUser = false

    const inviteRes = await admin.auth.admin.inviteUserByEmail(contractor.email, {
      data: { full_name: fullName, role: 'sales_rep' },
      redirectTo: dashboardUrl,
    })

    if (inviteRes.error) {
      // Most common case: auth user already exists (e.g. legacy manual
      // rep with same email). Look them up with a paginated lookup so we
      // do not silently miss users past the first listUsers page.
      const existing = await findAuthUserByEmail(admin, contractor.email)
      if (existing) {
        authUserId = existing.id
        linkedExistingUser = true
      } else {
        throw new Error(`inviteUserByEmail failed: ${inviteRes.error.message}`)
      }
    } else {
      authUserId = inviteRes.data.user?.id ?? null
    }

    if (!authUserId) {
      throw new Error('No auth user id returned from invite')
    }

    // Upsert sales_reps row keyed on user_id (UNIQUE constraint).
    // If a legacy row already exists for this user, link the contractor
    // to it instead of inserting a duplicate.
    const { data: existingRep } = await admin
      .from('sales_reps')
      .select('id')
      .eq('user_id', authUserId)
      .maybeSingle()

    let repId: string | null = existingRep?.id ?? null

    if (!repId) {
      const { data: insertedRep, error: repError } = await admin
        .from('sales_reps')
        .insert({
          user_id: authUserId,
          full_name: fullName,
          email: contractor.email,
          status: 'active',
          contractor_id: contractor.id,
          onboarded_via: 'contractor_flow',
          is_legacy: false,
          contract_signed_at: signed_at_iso,
        })
        .select('id')
        .single()
      if (repError || !insertedRep) {
        throw new Error(`sales_reps insert failed: ${repError?.message ?? 'no row'}`)
      }
      repId = insertedRep.id
    } else {
      // Link the existing rep row to this contractor.
      await admin
        .from('sales_reps')
        .update({
          contractor_id: contractor.id,
          onboarded_via: 'contractor_flow',
          contract_signed_at: signed_at_iso,
        })
        .eq('id', repId)
    }

    await admin
      .from('contractors')
      .update({
        sales_rep_id: repId,
        portal_invited_at: new Date().toISOString(),
        portal_access_email: contractor.email,
      })
      .eq('id', contractor.id)

    // When the auth user already existed, inviteUserByEmail did not
    // generate a magic-link email. Send a transactional note so they
    // know their portal is now ready.
    if (linkedExistingUser) {
      sendRepPortalAccessEmail({
        email: contractor.email,
        name: fullName,
        portalUrl: dashboardUrl,
      }).catch(() => {})
    }
  } catch (provisionErr) {
    const msg = provisionErr instanceof Error ? provisionErr.message : String(provisionErr)
    console.error('[contractor-sign] rep portal provisioning failed', msg)
    notifyAdminAlert(
      `⚠️ Rep portal provisioning failed for ${fullName} (${contractor.email}). ` +
      `Contractor is active but needs manual portal access. Check logs. (${msg})`,
    ).catch(() => {})
  }

  // Fire the signed-PDF webhook (best-effort). If we somehow do not
  // have a signed URL even though the upload succeeded, alert admin so
  // the missed delivery is not silently swallowed.
  if (signedUrl) {
    postSignedPdfDelivery({
      contractor_id: contractor.id,
      first_name: contractor.first_name,
      last_name: contractor.last_name,
      email: contractor.email,
      signed_at: signed_at_iso,
      signed_pdf_signed_url: signedUrl,
    }).catch(() => {})
  } else {
    notifyAdminAlert(
      `⚠️ Could not generate signed URL for ${fullName} (${contractor.email}). Make.com delivery skipped.`,
    ).catch(() => {})
  }

  return NextResponse.json({
    ok: true,
    signed_at: signed_at_iso,
    signed_pdf_url: signedUrl,
    used_template: usedTemplate,
    storage_path: storedPath,
  })
}
