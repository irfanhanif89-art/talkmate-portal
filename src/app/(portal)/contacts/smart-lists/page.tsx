import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { seedDefaultSmartLists, refreshSmartListCounts, type IndustrySlug } from '@/lib/smart-lists'
import SmartListsClient from './smart-lists-client'

// Server entry: ensure system lists are seeded for any business that doesn't
// have them yet (Session 2 brief Part 1 — retroactive seed).
export const dynamic = 'force-dynamic'

export default async function SmartListsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: business } = await supabase
    .from('businesses').select('id, industry').eq('owner_user_id', user.id).single()
  if (!business) redirect('/register')

  const { data: existing } = await supabase
    .from('smart_lists').select('id').eq('client_id', business.id).limit(1)
  if (!existing || existing.length === 0) {
    const admin = createAdminClient()
    await seedDefaultSmartLists(admin, business.id, business.industry as IndustrySlug | null)
    await refreshSmartListCounts(admin, business.id)
  }

  const { data: lists } = await supabase
    .from('smart_lists')
    .select('id, name, description, icon, color, is_system, contact_count, last_refreshed_at, filter_rules')
    .order('is_system', { ascending: false })
    .order('name', { ascending: true })

  return <SmartListsClient initialLists={lists ?? []} industry={business.industry as string | null} />
}
