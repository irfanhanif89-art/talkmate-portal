// GET /api/portal/me — mobile business-owner identity + profile.
//
// The linchpin of the mobile CLIENT app: after Supabase login, the app calls
// this with Authorization: Bearer <jwt>. requireClient(req) verifies the JWT,
// resolves the owner's business under RLS, and we map it into the shape the
// mobile app's AuthContext + screens expect (mock `business` shape).
//
// Bearer-only in practice (mobile), but requireClient also accepts the cookie
// session, so this works from the web too.

import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

// Monthly call allowance by plan. Pro = unlimited (null).
const CALL_LIMIT: Record<string, number | null> = {
  starter: 300,
  growth: 800,
  pro: null,
}

export async function GET(req: Request) {
  const auth = await requireClient(req)
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const { data: biz, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', clientId)
    .maybeSingle()

  if (error || !biz) {
    return NextResponse.json({ error: 'No business associated with this account' }, { status: 404 })
  }

  const plan = (biz.plan as string) || 'starter'
  const nc = (biz.notifications_config as Record<string, unknown> | null) || {}
  const escalationNumber =
    (nc.live_transfer_number as string) ||
    (nc.escalation_number as string) ||
    (biz.agent_phone_number as string) ||
    null

  const business = {
    id: biz.id as string,
    name: (biz.name as string) ?? '',
    industry: (biz.industry as string) ?? 'default',
    industry_role: (biz.trade_type as string) ?? null,
    plan,
    command_enabled:
      typeof biz.command_enabled === 'boolean'
        ? biz.command_enabled
        : plan === 'growth' || plan === 'pro',
    agentActive: ['active', 'live'].includes(String(biz.agent_status ?? '').toLowerCase()),
    phone: (biz.phone_number as string) ?? null,
    callLimit: plan in CALL_LIMIT ? CALL_LIMIT[plan] : null,
    // Real usage comes from GET /api/portal/dashboard; profile keeps a safe 0.
    callsThisMonth: 0,
    escalationNumber,
    location: (biz.address as string) ?? null,
    joinedDate: (biz.created_at as string) ?? (biz.signup_at as string) ?? null,
    account_status: (biz.account_status as string) ?? null,
    winback_enabled: (biz.winback_enabled as boolean) ?? null,
    review_requests_enabled: (biz.review_requests_enabled as boolean) ?? null,
  }

  return NextResponse.json({ ok: true, business })
}
