// Paginated list of chatbot sessions for the signed-in business (or
// admin-as-client via ?adminClientId=<uuid>). 20 per page, newest first,
// with optional status / date range / lead-only filters.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20
const VALID_STATUS = new Set(['active', 'ended', 'converted'])

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const adminClientId = params.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const pageRaw = parseInt(params.get('page') || '1', 10)
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const admin = createAdminClient()

  let query = admin
    .from('chat_sessions')
    .select(
      'id, lead_name, lead_phone, lead_email, lead_captured, message_count, status, started_at, ended_at',
      { count: 'exact' },
    )
    .eq('business_id', auth.businessId)

  const status = params.get('status')
  if (status && VALID_STATUS.has(status)) {
    query = query.eq('status', status)
  }

  const dateFrom = params.get('date_from')
  if (dateFrom) query = query.gte('started_at', dateFrom)

  const dateTo = params.get('date_to')
  if (dateTo) query = query.lte('started_at', dateTo)

  if (params.get('leadOnly') === 'true') {
    query = query.eq('lead_captured', true)
  }

  query = query.order('started_at', { ascending: false }).range(from, to)

  const { data, error, count } = await query

  if (error) {
    console.error('[chatbot/sessions] list failed', error.message)
    return NextResponse.json({ ok: false, error: 'list_failed' }, { status: 500 })
  }

  const sessions = (data ?? []).map((s) => ({
    id: s.id,
    leadName: s.lead_name ?? null,
    leadPhone: s.lead_phone ?? null,
    leadEmail: s.lead_email ?? null,
    leadCaptured: s.lead_captured,
    messageCount: s.message_count,
    status: s.status,
    startedAt: s.started_at,
    endedAt: s.ended_at,
  }))

  // This-month stats for the analytics card, including the deflection count
  // (assistant replies that fell back to "I will have someone follow up").
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString()
  const [convThisMonth, leadsThisMonth, answered, needsFollowUp] = await Promise.all([
    admin.from('chat_sessions').select('id', { count: 'exact', head: true })
      .eq('business_id', auth.businessId).gte('started_at', monthStart),
    admin.from('chat_sessions').select('id', { count: 'exact', head: true })
      .eq('business_id', auth.businessId).eq('lead_captured', true).gte('started_at', monthStart),
    admin.from('chat_messages').select('id', { count: 'exact', head: true })
      .eq('business_id', auth.businessId).eq('role', 'assistant').eq('is_fallback', false).gte('created_at', monthStart),
    admin.from('chat_messages').select('id', { count: 'exact', head: true })
      .eq('business_id', auth.businessId).eq('role', 'assistant').eq('is_fallback', true).gte('created_at', monthStart),
  ])

  return NextResponse.json({
    ok: true,
    sessions,
    page,
    pageSize: PAGE_SIZE,
    total: count ?? 0,
    stats: {
      conversationsThisMonth: convThisMonth.count ?? 0,
      leadsThisMonth: leadsThisMonth.count ?? 0,
      questionsAnswered: answered.count ?? 0,
      needsFollowUp: needsFollowUp.count ?? 0,
    },
  })
}
