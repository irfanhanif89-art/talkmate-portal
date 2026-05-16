import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

// Read-only public holidays for the calling client's state. The scheduler
// settings tab uses this to show the next upcoming holiday banner.

const VALID_STATES = new Set(['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'])

export async function GET(request: Request) {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase } = auth

  const { searchParams } = new URL(request.url)
  let state = (searchParams.get('state') ?? '').toUpperCase()
  if (!state) {
    const { data: settings } = await supabase
      .from('scheduler_settings')
      .select('state')
      .eq('client_id', auth.clientId)
      .maybeSingle()
    state = (settings?.state as string | null) ?? 'VIC'
  }
  if (!VALID_STATES.has(state)) {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('public_holidays')
    .select('holiday_name, holiday_date, is_national')
    .eq('state', state)
    .gte('holiday_date', today)
    .order('holiday_date', { ascending: true })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ state, holidays: data ?? [] })
}
