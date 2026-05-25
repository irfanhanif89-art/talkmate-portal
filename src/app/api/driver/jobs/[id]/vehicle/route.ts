import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireDriver } from '@/lib/driver-auth'

// PATCH /api/driver/jobs/[id]/vehicle — driver corrects the vehicle
// fields on scene. The dispatcher may have entered the wrong rego /
// colour / make / model; the driver fixes it from the truck.

const FIELDS = [
  'vehicle_make',
  'vehicle_model',
  'vehicle_year',
  'vehicle_colour',
  'vehicle_rego',
  'vehicle_condition',
] as const

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireDriver()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const update: Record<string, string | null> = {}
  for (const f of FIELDS) {
    if (f in body) {
      const v = body[f]
      if (v === null || v === '') update[f] = null
      else if (typeof v === 'string') update[f] = v.trim()
    }
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: 'No vehicle fields to update' }, { status: 400 })
  }

  const admin = createAdminClient()
  // RLS-equivalent enforcement: only update if the job is assigned to this driver.
  const { data: job } = await admin
    .from('dispatch_jobs')
    .select('id')
    .eq('id', id)
    .eq('driver_id', auth.driver.id)
    .maybeSingle()
  if (!job) return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 })

  const { error } = await admin.from('dispatch_jobs').update(update).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
