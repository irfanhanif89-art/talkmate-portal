import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireDriver } from '@/lib/driver-auth'

// GET /api/driver/jobs/[id] — full job detail including photo list.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireDriver()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await params
  const admin = createAdminClient()

  const { data: job } = await admin
    .from('dispatch_jobs')
    .select('*')
    .eq('id', id)
    .eq('driver_id', auth.driver.id)
    .maybeSingle()

  if (!job) return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 })

  const { data: photos } = await admin
    .from('dispatch_job_photos')
    .select('id, photo_url, photo_type, caption, taken_at')
    .eq('dispatch_job_id', id)
    .order('taken_at', { ascending: true })

  return NextResponse.json({ ok: true, job, photos: photos ?? [] })
}
