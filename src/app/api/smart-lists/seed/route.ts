import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { seedDefaultSmartLists, refreshSmartListCounts, type IndustrySlug } from '@/lib/smart-lists'

// Session 2 brief Part 1 — retroactively seed system smart lists for an
// existing business. Idempotent. Called automatically on first visit to the
// smart-lists page if no lists exist for the current client.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { data: business } = await supabase.from('businesses').select('id, industry').eq('owner_user_id', user.id).single()
  if (!business) return NextResponse.json({ ok: false, error: 'No business' }, { status: 404 })

  const admin = createAdminClient()
  const seedResult = await seedDefaultSmartLists(admin, business.id, business.industry as IndustrySlug | null)
  // Compute initial counts so the UI doesn't show "0" until next refresh.
  refreshSmartListCounts(admin, business.id).catch(e => console.error('[smart-lists/seed] refresh', e))

  return NextResponse.json({ ok: true, ...seedResult })
}
