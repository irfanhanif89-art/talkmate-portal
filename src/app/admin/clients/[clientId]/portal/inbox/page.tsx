// Admin-as-client SMS Inbox view. Reuses InboxView with adminClientId
// so all API calls hit the admin-override branch in
// /api/sms/conversations and /api/sms/conversations/[id].

import { createAdminClient } from '@/lib/supabase/server'
import InboxView, { type ConversationListItem } from '@/app/(portal)/inbox/inbox-view'
import InboxTabs from '@/app/(portal)/inbox/inbox-tabs'

export const dynamic = 'force-dynamic'

export default async function AdminInboxPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  const admin = createAdminClient()

  const { data: business } = await admin
    .from('businesses')
    .select('id, name, twilio_phone_number, talkmate_number')
    .eq('id', clientId)
    .limit(1)
    .maybeSingle()

  if (!business) {
    return (
      <div style={{ padding: 32, color: 'white' }}>Client not found.</div>
    )
  }

  const { data: convoRows } = await admin
    .from('sms_conversations')
    .select(`
      id, phone_number, contact_id, last_message_at,
      last_message_preview, unread_count, status,
      contact:contacts!sms_conversations_contact_id_fkey ( name )
    `)
    .eq('business_id', clientId)
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
    <InboxTabs businessId={clientId} adminClientId={clientId}>
      <InboxView
        businessId={clientId}
        businessName={(business.name as string | null) ?? 'Client'}
        hasTwilioNumber={hasTwilioNumber}
        initialConversations={conversations}
        adminClientId={clientId}
      />
    </InboxTabs>
  )
}
