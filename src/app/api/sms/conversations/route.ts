// GET /api/sms/conversations
// Optional: ?adminClientId=<uuid> for admin-as-client mode.
//
// Lists the resolved business's SMS conversations for the inbox view.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

interface ConvoRow {
  id: string
  phone_number: string
  contact_id: string | null
  last_message_at: string | null
  last_message_preview: string | null
  unread_count: number | null
  status: string | null
  contact: { name: string | null } | null
}

export async function GET(request: Request) {
  const adminClientId = new URL(request.url).searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('sms_conversations')
    .select(`
      id,
      phone_number,
      contact_id,
      last_message_at,
      last_message_preview,
      unread_count,
      status,
      contact:contacts!sms_conversations_contact_id_fkey ( name )
    `)
    .eq('business_id', auth.businessId)
    .eq('status', 'active')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(200)

  if (error) {
    console.error('[sms/conversations] list failed', error.message)
    return NextResponse.json({ ok: false, error: 'list_failed' }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as ConvoRow[]
  const totalUnread = rows.reduce((sum, r) => sum + (r.unread_count ?? 0), 0)

  return NextResponse.json({
    ok: true,
    totalUnread,
    conversations: rows.map(r => ({
      id: r.id,
      phoneNumber: r.phone_number,
      contactId: r.contact_id,
      contactName: r.contact?.name ?? null,
      lastMessageAt: r.last_message_at,
      lastMessagePreview: r.last_message_preview,
      unreadCount: r.unread_count ?? 0,
      status: r.status,
    })),
  })
}
