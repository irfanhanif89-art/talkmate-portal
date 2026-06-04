// Session 4A (Round 1) — persists confirmed onboarding data from the pre-wizard.
// Used by Step 0B (review), the agent identity step, and the integration step.
// Writes a whitelisted set of businesses columns + accepted KB entries, then
// marks the relevant go-live gate items.
//
// SAFETY: this only ever writes the requesting user's OWN business. Inserting
// KB entries flips that business's kb_sync_status to 'pending'; for a new
// onboarding business with no vapi_agent_id, performKbSync no-ops, so no live
// agent is touched. Round 1 does NOT PATCH Vapi here (no voice/identity push).

import { NextResponse } from 'next/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { createAdminClient } from '@/lib/supabase/server'
import { getGoLiveStatus, markGateItem } from '@/lib/onboarding-gate'

export const runtime = 'nodejs'

const KB_CATEGORIES = new Set(['faq', 'service', 'hours', 'pricing', 'team', 'custom'])

// Only these businesses columns can be written by this route.
const ALLOWED_FIELDS = new Set([
  'name', 'phone', 'industry', 'owner_name',
  'agent_name', 'agent_voice_id',
  'integration_mode', 'integration_ring_delay', 'carrier',
  'onboarding_auto_populated', 'onboarding_source_url',
])

interface ApplyBody {
  businessFields?: Record<string, unknown>
  acceptedKb?: { category: string; question: string; answer: string }[]
  markAgentNamed?: boolean
  markModeSelected?: boolean
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const resolved = await resolveBusinessId(url.searchParams.get('adminClientId'), req)
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  let body: ApplyBody
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }

  const supabase = createAdminClient()
  const businessId = resolved.businessId

  // 1. Whitelisted businesses field update.
  if (body.businessFields && typeof body.businessFields === 'object') {
    const patch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body.businessFields)) {
      if (ALLOWED_FIELDS.has(k) && v !== undefined && v !== '') patch[k] = v
    }
    // Validate integration_mode if present.
    if (patch.integration_mode && !['overflow', 'after_hours', 'full_time'].includes(String(patch.integration_mode))) {
      delete patch.integration_mode
    }
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('businesses').update(patch).eq('id', businessId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // 2. Accepted KB entries.
  let insertedKb = 0
  if (Array.isArray(body.acceptedKb) && body.acceptedKb.length > 0) {
    const rows = body.acceptedKb
      .filter(e => e && KB_CATEGORIES.has((e.category || '').toLowerCase()) && e.question?.trim() && (e.answer?.trim().length ?? 0) >= 10)
      .map((e, i) => ({
        business_id: businessId,
        category: e.category.toLowerCase(),
        question: e.question.trim().slice(0, 200),
        answer: e.answer.trim().slice(0, 2000),
        sort_order: i * 10,
      }))
    if (rows.length > 0) {
      const { error } = await supabase.from('knowledge_base_entries').insert(rows)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      insertedKb = rows.length
    }
  }

  // 3. Gate marks.
  const gatePatch: Record<string, boolean> = {}
  if (body.markAgentNamed) gatePatch.agent_named = true
  if (body.markModeSelected) gatePatch.mode_selected = true
  if (Object.keys(gatePatch).length > 0) await markGateItem(supabase, businessId, gatePatch)

  const status = await getGoLiveStatus(supabase, businessId)
  return NextResponse.json({ ok: true, insertedKb, status })
}
