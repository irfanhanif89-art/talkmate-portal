import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ContactsListClient from './contacts-list-client'
import DemoDataBanner from '@/components/portal/demo-data-banner'
import { DEMO_PHONE_PREFIX } from '@/lib/demo-data'

// /contacts list. Server fetches the first page; client handles search,
// filters, and pagination via /api/contacts/list.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Contacts' }

export default async function ContactsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses').select('id, industry').eq('owner_user_id', user.id).single()
  if (!business) redirect('/register')

  const [{ data: contacts }, { count: totalCount }, { count: demoCount }, { data: userProfile }] = await Promise.all([
    supabase.from('contacts')
      .select('id, name, phone, call_count, last_seen, tags, first_seen')
      .eq('client_id', business.id).eq('is_merged', false)
      .order('last_seen', { ascending: false })
      .limit(100),
    supabase.from('contacts').select('id', { count: 'exact', head: true })
      .eq('client_id', business.id).eq('is_merged', false),
    supabase.from('contacts').select('id', { count: 'exact', head: true })
      .eq('client_id', business.id).like('phone', `${DEMO_PHONE_PREFIX}%`),
    supabase.from('users').select('role').eq('id', user.id).single(),
  ])

  const isAdmin = userProfile?.role === 'admin'
    || user.email === process.env.INTERNAL_ALERT_EMAIL
    || user.email === 'hello@talkmate.com.au'

  return (
    <div>
      {(demoCount ?? 0) > 0 && (
        <div style={{ padding: '20px 28px 0' }}>
          <DemoDataBanner businessId={business.id} isAdmin={isAdmin} />
        </div>
      )}
      <ContactsListClient
        industry={business.industry as string | null}
        initialContacts={contacts ?? []}
        totalCount={totalCount ?? 0}
      />
    </div>
  )
}
