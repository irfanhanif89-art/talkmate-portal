import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

export async function GET(request: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') // optional

  let q = supabase
    .from('waitlist')
    .select('*')
    .order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ waitlist: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const callerPhone = String(body.caller_phone ?? '').trim()
  if (!callerPhone) return NextResponse.json({ error: 'caller_phone required' }, { status: 400 })

  const { count } = await supabase
    .from('waitlist')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('status', 'waiting')
  const position = (count ?? 0) + 1

  const { data, error } = await supabase
    .from('waitlist')
    .insert({
      client_id: clientId,
      caller_phone: callerPhone,
      caller_name: typeof body.caller_name === 'string' ? body.caller_name : null,
      requested_date: typeof body.requested_date === 'string' ? body.requested_date : null,
      requested_time_preference: typeof body.requested_time_preference === 'string' ? body.requested_time_preference : null,
      truck_type: typeof body.truck_type === 'string' ? body.truck_type : null,
      rate_type: typeof body.rate_type === 'string' ? body.rate_type : null,
      pickup_address: typeof body.pickup_address === 'string' ? body.pickup_address : null,
      dropoff_address: typeof body.dropoff_address === 'string' ? body.dropoff_address : null,
      description: typeof body.description === 'string' ? body.description : null,
      position,
      status: 'waiting',
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry: data, position })
}
