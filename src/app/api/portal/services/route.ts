import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/portal/services
//
// Client-side save for the "Services and Pricing" section on the AI Voice
// Agent settings tab. RLS scopes the update to the caller's own business
// (businesses.owner_user_id = auth.uid() per migration 001's "owner_all"
// policy), so we don't need to re-check ownership here.
//
// Body: { services: Service[] }
// Auth: Supabase user session cookie

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (!Array.isArray(body.services)) {
    return NextResponse.json({ error: 'Invalid payload: services must be an array' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('businesses')
    .update({ services: body.services })
    .eq('owner_user_id', user.id)
    .select('id, services')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, data })
}
