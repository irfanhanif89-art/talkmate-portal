import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { sendEmail } from '@/lib/resend'
import { contractReadyEmailHtml } from '@/lib/sales-notify'

export const runtime = 'nodejs'

const MAX_SIZE = 20 * 1024 * 1024 // 20MB

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ ok: false, error: 'Multipart form expected' }, { status: 400 })

  const rep_id = String(form.get('rep_id') ?? '').trim()
  const file = form.get('file')
  const document_name = String(form.get('document_name') ?? '').trim() || 'Sales Rep Agreement'
  const policy_version = String(form.get('policy_version') ?? 'v1').trim() || 'v1'

  if (!rep_id) return NextResponse.json({ ok: false, error: 'rep_id is required' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'file is required' }, { status: 400 })
  if (file.type !== 'application/pdf') return NextResponse.json({ ok: false, error: 'Only PDF files accepted' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ ok: false, error: 'Max file size is 20MB' }, { status: 400 })

  const admin = createAdminClient()
  const { data: rep } = await admin.from('sales_reps')
    .select('id, full_name, email')
    .eq('id', rep_id)
    .maybeSingle()
  if (!rep) return NextResponse.json({ ok: false, error: 'Rep not found' }, { status: 404 })

  // Upload to rep-contracts/{rep_id}/{timestamp}_{cleaned_name}.pdf
  const ts = Date.now()
  const cleanedName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'contract.pdf'
  const objectPath = `${rep_id}/${ts}_${cleanedName}`

  const bytes = await file.arrayBuffer()
  const { error: uploadErr } = await admin.storage
    .from('rep-contracts')
    .upload(objectPath, bytes, { contentType: 'application/pdf', upsert: false })

  if (uploadErr) {
    return NextResponse.json({ ok: false, error: `Upload failed: ${uploadErr.message}` }, { status: 500 })
  }

  // Supersede any existing pending contract
  await admin.from('rep_contracts')
    .update({ status: 'superseded' })
    .eq('rep_id', rep_id)
    .eq('status', 'pending_signature')

  const { error: insertErr } = await admin.from('rep_contracts').insert({
    rep_id,
    document_name,
    document_path: objectPath,
    policy_version,
    status: 'pending_signature',
  })

  if (insertErr) {
    // Try to clean up the uploaded file so we don't leave an orphan.
    await admin.storage.from('rep-contracts').remove([objectPath]).catch(() => {})
    return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 })
  }

  // Notify rep
  sendEmail({
    to: rep.email,
    subject: 'Your TalkMate contract is ready to sign',
    html: contractReadyEmailHtml({ repName: rep.full_name }),
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
