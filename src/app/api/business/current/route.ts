// GET /api/business/current
//
// Lightweight "who am I" summary for the mobile app: the fields the client
// Settings screen renders and the post-login router needs to decide between the
// Onboarding readiness screen (not yet live) and the normal client tabs.
// Bearer (or cookie) via requireClient, so the JWT-bound RLS client scopes to
// the owner's own business.

import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireClient(request)
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const { data, error } = await supabase
    .from('businesses')
    .select(
      'id, name, plan, account_status, agent_name, integration_mode, go_live_gate_passed, chatbot_enabled, winback_enabled, review_requests_enabled, google_review_url',
    )
    .eq('id', clientId)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    business: {
      id: data.id,
      name: data.name ?? null,
      plan: data.plan ?? null,
      accountStatus: data.account_status ?? null,
      agentName: data.agent_name ?? null,
      integrationMode: data.integration_mode ?? null,
      goLiveGatePassed: data.go_live_gate_passed ?? false,
      chatbotEnabled: data.chatbot_enabled ?? false,
      winbackEnabled: data.winback_enabled ?? true,
      reviewRequestsEnabled: data.review_requests_enabled ?? false,
      googleReviewUrl: data.google_review_url ?? '',
    },
  })
}
