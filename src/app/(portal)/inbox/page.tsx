// SMS Inbox (Two-way) — Sprint Session 1
//
// Server component: authenticates the user, resolves their business,
// gates Starter plans (Inbox is Growth+ per the pricing matrix), and
// renders the InboxView client component with the initial conversation
// list pre-loaded. The view subscribes to realtime for live updates.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import InboxView, { type ConversationListItem } from './inbox-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Inbox · TalkMate' }

const PAID_PLANS = new Set(['growth', 'pro', 'professional'])

export default async function InboxPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, plan, twilio_phone_number, talkmate_number')
    .eq('owner_user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!business) redirect('/dashboard')

  const plan = ((business.plan as string | null) ?? 'starter').toLowerCase()
  if (!PAID_PLANS.has(plan)) {
    return (
      <div style={{ padding: 32, maxWidth: 720, margin: '0 auto', color: '#F2F6FB', fontFamily: 'Outfit, sans-serif' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white', marginBottom: 8 }}>Inbox</h1>
        <p style={{ fontSize: 14, color: '#7BAED4', marginBottom: 28 }}>
          Two-way SMS conversations with your customers — reply from one place, get AI-suggested responses.
        </p>
        <div style={{
          background: 'linear-gradient(135deg, rgba(232,98,42,0.10) 0%, rgba(21,101,192,0.10) 100%)',
          border: '1px solid rgba(232,98,42,0.25)',
          borderRadius: 16, padding: 28,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#E8622A', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Available on Growth and Pro
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', marginBottom: 10 }}>Manage every customer text from one place</h2>
          <p style={{ fontSize: 14, color: '#7BAED4', lineHeight: 1.6, marginBottom: 20 }}>
            When you upgrade, every SMS your TalkMate number receives lands here. Reply directly, let AI suggest responses, and never lose a lead in a text thread.
          </p>
          <a
            href={process.env.NEXT_PUBLIC_STRIPE_GROWTH_LINK ?? '/billing'}
            style={{
              display: 'inline-block', background: '#E8622A', color: 'white',
              padding: '12px 22px', borderRadius: 10, fontSize: 14, fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Upgrade to Growth
          </a>
        </div>
      </div>
    )
  }

  // Initial conversation list — server-side fetch so the first paint
  // already has data; the client then subscribes to realtime for updates.
  const { data: convoRows } = await supabase
    .from('sms_conversations')
    .select(`
      id, phone_number, contact_id, last_message_at,
      last_message_preview, unread_count, status,
      contact:contacts!sms_conversations_contact_id_fkey ( name )
    `)
    .eq('business_id', business.id)
    .eq('status', 'active')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(200)

  const conversations: ConversationListItem[] = (convoRows ?? []).map((r: unknown) => {
    const row = r as {
      id: string
      phone_number: string
      contact_id: string | null
      last_message_at: string | null
      last_message_preview: string | null
      unread_count: number | null
      status: string | null
      contact: { name: string | null } | null
    }
    return {
      id: row.id,
      phoneNumber: row.phone_number,
      contactId: row.contact_id,
      contactName: row.contact?.name ?? null,
      lastMessageAt: row.last_message_at,
      lastMessagePreview: row.last_message_preview,
      unreadCount: row.unread_count ?? 0,
      status: row.status,
    }
  })

  const hasTwilioNumber = Boolean(business.twilio_phone_number ?? business.talkmate_number)

  return (
    <InboxView
      businessId={business.id as string}
      businessName={(business.name as string | null) ?? 'Your business'}
      hasTwilioNumber={hasTwilioNumber}
      initialConversations={conversations}
    />
  )
}
