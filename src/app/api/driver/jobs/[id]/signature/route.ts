import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireDriver } from '@/lib/driver-auth'

// POST /api/driver/jobs/[id]/signature — store a customer signature.
//
// Body (JSON): { signature_data: <data:image/png;base64,...>, signature_type: 'pickup' | 'delivery' }
//
// The client captures the signature on an HTML5 canvas and posts the
// data-URL here. We strip the prefix, upload to storage as PNG, then
// stamp the URL + timestamp on dispatch_jobs.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireDriver()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await params

  const body = (await req.json().catch(() => ({}))) as {
    signature_data?: unknown
    signature_type?: unknown
  }
  const dataUrl = typeof body.signature_data === 'string' ? body.signature_data : ''
  const sigType = typeof body.signature_type === 'string' ? body.signature_type : ''

  if (sigType !== 'pickup' && sigType !== 'delivery') {
    return NextResponse.json({ ok: false, error: 'signature_type must be pickup or delivery' }, { status: 400 })
  }
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl)
  if (!match) {
    return NextResponse.json({ ok: false, error: 'signature_data must be a PNG data URL' }, { status: 400 })
  }
  const png = Buffer.from(match[1], 'base64')
  // Sanity cap: 2MB is huge for a signature pad PNG.
  if (png.byteLength > 2 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: 'Signature too large' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: job } = await admin
    .from('dispatch_jobs')
    .select('id, client_id')
    .eq('id', id)
    .eq('driver_id', auth.driver.id)
    .maybeSingle()
  if (!job) return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 })

  const path = `${job.client_id}/${id}/signatures/${sigType}.png`
  const { error: upErr } = await admin.storage
    .from('dispatch-media')
    .upload(path, png, { contentType: 'image/png', upsert: true })
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 })

  const { data: signed } = await admin.storage
    .from('dispatch-media')
    .createSignedUrl(path, 60 * 60 * 24 * 365)

  const url = signed?.signedUrl ?? path
  const now = new Date().toISOString()
  const update = sigType === 'pickup'
    ? { pickup_signature_url: url, pickup_signature_at: now }
    : { delivery_signature_url: url, delivery_signature_at: now }

  const { error: updErr } = await admin.from('dispatch_jobs').update(update).eq('id', id)
  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, signature_url: url })
}
