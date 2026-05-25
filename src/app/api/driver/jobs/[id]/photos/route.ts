import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireDriver } from '@/lib/driver-auth'

// POST /api/driver/jobs/[id]/photos — driver uploads a photo for a
// dispatch job. multipart/form-data body:
//   file        — image (jpeg/png/webp), <= 10 MB
//   photo_type  — pickup | delivery | damage | other
//   caption?    — optional caption
//
// Server-side upload (rather than letting the client write directly
// to storage) so we can centrally update the per-job photo counters
// without a separate round-trip.

const VALID_TYPES = new Set(['pickup', 'delivery', 'damage', 'other'])
const VALID_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 10 * 1024 * 1024

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireDriver()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await params

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'multipart/form-data expected' }, { status: 400 })
  }

  const file = form.get('file')
  const photoType = String(form.get('photo_type') ?? '').toLowerCase()
  const caption = String(form.get('caption') ?? '').trim() || null

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'file is required' }, { status: 400 })
  }
  if (!VALID_TYPES.has(photoType)) {
    return NextResponse.json({ ok: false, error: 'photo_type must be pickup, delivery, damage, or other' }, { status: 400 })
  }
  if (!VALID_MIME.has(file.type)) {
    return NextResponse.json({ ok: false, error: 'Only JPEG, PNG, or WebP images allowed' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'File exceeds 10MB limit' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Confirm the job belongs to this driver.
  const { data: job } = await admin
    .from('dispatch_jobs')
    .select('id, client_id')
    .eq('id', id)
    .eq('driver_id', auth.driver.id)
    .maybeSingle()
  if (!job) return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 })

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const filename = `${crypto.randomUUID()}.${ext}`
  const path = `${job.client_id}/${id}/${photoType}/${filename}`

  const arrayBuf = await file.arrayBuffer()
  const { error: upErr } = await admin.storage
    .from('dispatch-media')
    .upload(path, arrayBuf, { contentType: file.type, upsert: false })
  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 })
  }

  const { data: signed } = await admin.storage
    .from('dispatch-media')
    .createSignedUrl(path, 60 * 60 * 24 * 365) // 1 year — long enough for the job lifecycle

  const photoUrl = signed?.signedUrl ?? path

  const { data: photo, error: insErr } = await admin
    .from('dispatch_job_photos')
    .insert({
      dispatch_job_id: id,
      client_id: job.client_id,
      driver_id: auth.driver.id,
      photo_url: photoUrl,
      photo_type: photoType,
      caption,
    })
    .select('id, photo_url, photo_type, caption, taken_at')
    .maybeSingle()
  if (insErr) {
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 })
  }

  // Bump the per-job counter for the gate checks in /status.
  if (photoType === 'pickup' || photoType === 'delivery') {
    const counterField = photoType === 'pickup' ? 'pickup_photo_count' : 'delivery_photo_count'
    // Postgres RPC for atomic increment would be ideal; readback-and-
    // increment is acceptable here because writes per job are bursty
    // but never concurrent across drivers (driver_id is one).
    const { data: cur } = await admin
      .from('dispatch_jobs')
      .select(counterField)
      .eq('id', id)
      .maybeSingle<Record<string, number | null>>()
    const next = ((cur?.[counterField] as number | null | undefined) ?? 0) + 1
    await admin.from('dispatch_jobs').update({ [counterField]: next }).eq('id', id)
  }

  return NextResponse.json({ ok: true, photo })
}
