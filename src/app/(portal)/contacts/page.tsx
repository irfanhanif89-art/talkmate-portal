import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ContactsListClient from './contacts-list-client'

// /contacts list. Server fetches the first page; client handles search,
// filters, and pagination via /api/contacts/list.
export const dynamic = 'force-dynamic'

export default async function ContactsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses').select('id, industry').eq('owner_user_id', user.id).single()
  if (!business) redirect('/register')

  const [{ data: contacts }, { count: totalCount }] = await Promise.all([
    supabase.from('contacts')
      .select('id, name, phone, call_count, last_seen, tags, first_seen')
      .eq('client_id', business.id).eq('is_merged', false)
      .order('last_seen', { ascending: false })
      .limit(100),
    supabase.from('contacts').select('id', { count: 'exact', head: true })
      .eq('client_id', business.id).eq('is_merged', false),
  ])

  return (
    <ContactsListClient
      industry={business.industry as string | null}
      initialContacts={contacts ?? []}
      totalCount={totalCount ?? 0}
    />
  )
}
