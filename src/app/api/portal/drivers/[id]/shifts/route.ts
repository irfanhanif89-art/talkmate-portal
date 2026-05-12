import { NextResponse } from 'next/server'
import { requireDispatchAccess } from '@/lib/portal-auth'

// GET — list this driver's shifts (one row per active weekday).
// POST — replace the whole shift schedule for this driver. Body:
//        { shifts: [{ day_of_week, start_time, end_time, active }] }
//        Days not present in the body are deleted. Simpler for the UI
//        than upserting individual rows.

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireDispatchAccess()
  if ('error' in auth) return auth.error
  const { supabase } = auth
  const { id } = await params

  const { data, error } = await supabase
    .from('driver_shifts')
    .select('*')
    .eq('driver_id', id)
    .order('day_of_week', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ shifts: data ?? [] })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireDispatchAccess()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth
  const { id } = await params

  const body = (await request.json().catch(() => ({}))) as { shifts?: Array<{
    day_of_week?: number
    start_time?: string
    end_time?: string
    active?: boolean
  }> }
  const rows = (body.shifts ?? []).filter(s =>
    typeof s.day_of_week === 'number' &&
    s.day_of_week >= 0 && s.day_of_week <= 6 &&
    typeof s.start_time === 'string' && typeof s.end_time === 'string',
  )

  // Wipe & replace. RLS scopes the delete to the caller's client.
  const { error: delErr } = await supabase
    .from('driver_shifts')
    .delete()
    .eq('driver_id', id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (rows.length === 0) return NextResponse.json({ shifts: [] })

  const { data, error } = await supabase
    .from('driver_shifts')
    .insert(rows.map(s => ({
      client_id: clientId,
      driver_id: id,
      day_of_week: s.day_of_week!,
      start_time: s.start_time!,
      end_time: s.end_time!,
      active: s.active !== false,
    })))
    .select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ shifts: data ?? [] })
}
