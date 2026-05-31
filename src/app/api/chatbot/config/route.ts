// Chatbot config for the signed-in business (or admin-as-client via
// ?adminClientId=<uuid>). GET returns the current config; PATCH updates it
// with validation and plan gating (starter plans cannot enable the chatbot).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

const VALID_COLLECT_AFTER = new Set([1, 2, 3, 5])
const COLOR_RE = /^#[0-9a-fA-F]{6}$/
const MAX_AGENT_NAME = 40
const MAX_GREETING = 200

interface ConfigShape {
  enabled: boolean
  greeting: string | null
  agentName: string | null
  primaryColor: string | null
  collectLeadsAfter: number | null
  slug: string | null
  plan: string | null
}

function toConfig(row: {
  chatbot_enabled: boolean | null
  chatbot_greeting: string | null
  chatbot_agent_name: string | null
  chatbot_primary_color: string | null
  chatbot_collect_leads_after: number | null
  slug: string | null
  plan: string | null
}): ConfigShape {
  return {
    enabled: row.chatbot_enabled ?? false,
    greeting: row.chatbot_greeting,
    agentName: row.chatbot_agent_name,
    primaryColor: row.chatbot_primary_color,
    collectLeadsAfter: row.chatbot_collect_leads_after,
    slug: row.slug,
    plan: row.plan,
  }
}

const SELECT_COLS =
  'chatbot_enabled, chatbot_greeting, chatbot_agent_name, chatbot_primary_color, chatbot_collect_leads_after, slug, plan'

export async function GET(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: business, error } = await admin
    .from('businesses')
    .select(SELECT_COLS)
    .eq('id', auth.businessId)
    .maybeSingle()

  if (error || !business) {
    console.error('[chatbot/config] load failed', error?.message)
    return NextResponse.json({ ok: false, error: 'business_not_found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, config: toConfig(business) })
}

export async function PATCH(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  let body: {
    enabled?: boolean
    greeting?: string
    agentName?: string
    primaryColor?: string
    collectLeadsAfter?: number
  }
  try { body = await request.json() as typeof body }
  catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }) }

  const admin = createAdminClient()

  // Need the current plan to enforce gating on enable=true.
  const { data: current, error: loadErr } = await admin
    .from('businesses')
    .select(SELECT_COLS)
    .eq('id', auth.businessId)
    .maybeSingle()

  if (loadErr || !current) {
    console.error('[chatbot/config] load failed', loadErr?.message)
    return NextResponse.json({ ok: false, error: 'business_not_found' }, { status: 404 })
  }

  const patch: Record<string, unknown> = {}

  if (typeof body.enabled === 'boolean') {
    if (body.enabled === true && current.plan === 'starter') {
      return NextResponse.json({ ok: false, error: 'plan_locked' }, { status: 403 })
    }
    patch.chatbot_enabled = body.enabled
  }

  if (typeof body.greeting === 'string') {
    const g = body.greeting.trim()
    if (g.length > MAX_GREETING) {
      return NextResponse.json({ ok: false, error: 'invalid_greeting' }, { status: 400 })
    }
    patch.chatbot_greeting = g
  }

  if (typeof body.agentName === 'string') {
    const n = body.agentName.trim()
    if (n.length > MAX_AGENT_NAME) {
      return NextResponse.json({ ok: false, error: 'invalid_agent_name' }, { status: 400 })
    }
    patch.chatbot_agent_name = n
  }

  if (typeof body.primaryColor === 'string') {
    if (!COLOR_RE.test(body.primaryColor)) {
      return NextResponse.json({ ok: false, error: 'invalid_primary_color' }, { status: 400 })
    }
    patch.chatbot_primary_color = body.primaryColor
  }

  if (typeof body.collectLeadsAfter === 'number') {
    if (!VALID_COLLECT_AFTER.has(body.collectLeadsAfter)) {
      return NextResponse.json({ ok: false, error: 'invalid_collect_leads_after' }, { status: 400 })
    }
    patch.chatbot_collect_leads_after = body.collectLeadsAfter
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'no_changes' }, { status: 400 })
  }

  const { data: updated, error } = await admin
    .from('businesses')
    .update(patch)
    .eq('id', auth.businessId)
    .select(SELECT_COLS)
    .maybeSingle()

  if (error || !updated) {
    console.error('[chatbot/config] update failed', error?.message)
    return NextResponse.json({ ok: false, error: 'update_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, config: toConfig(updated) })
}
