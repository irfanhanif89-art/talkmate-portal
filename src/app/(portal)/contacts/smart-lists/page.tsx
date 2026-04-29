import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { seedDefaultSmartLists, refreshSmartListCounts, type IndustrySlug } from '@/lib/smart-lists'
import SmartListsClient from './smart-lists-client'

// Server entry: ensure system lists are seeded for any business that doesn't
// have them yet (Session 2 brief Part 1 — retroactive seed).
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Smart Lists' }

export default async function SmartListsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: business } = await supabase
    .from('businesses').select('id, industry').eq('owner_user_id', user.id).single()
  if (!business) redirect('/register')

  // Always run the (idempotent) seeder — `seedDefaultSmartLists` skips lists
  // whose names already exist, so this back-fills industry-specific lists
  // for any business that was seeded before its industry was supported
  // (e.g. towing accounts seeded with universal-only lists pre-Session 2).
  const admin = createAdminClient()
  const seeded = await seedDefaultSmartLists(admin, business.id, business.industry as IndustrySlug | null)
  if ((seeded.inserted ?? 0) > 0) {
    await refreshSmartListCounts(admin, business.id)
  }

  const { data: lists } = await supabase
    .from('smart_lists')
    .select('id, name, description, icon, color, is_system, contact_count, last_refreshed_at, filter_rules')
    .order('is_system', { ascending: false })
    .order('name', { ascending: true })

  return <SmartListsClient initialLists={lists ?? []} industry={business.industry as string | null} />
}
