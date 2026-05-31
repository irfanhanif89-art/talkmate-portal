// POST /api/knowledge-base/sync
//
// Pulls every active KB entry for the requesting business, builds the
// BUSINESS KNOWLEDGE block, and PATCHes the Vapi assistant's system
// prompt to embed it. Mirrors the prompt-block pattern used by
// /api/vapi/sync — we only touch the KB block, never the rest of
// the prompt.
//
// On success: stamp businesses.kb_last_synced_at + kb_sync_status='synced'
// and append a row to knowledge_base_sync_log.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { injectKbBlock, type KbEntry } from '@/lib/kb-block'
import { resolveBusinessId } from '@/lib/resolve-business'

// Performs the sync given a resolved businessId. Shared with the cron
// route so both code paths use exactly the same Vapi PATCH shape.
export async function performKbSync(
  businessId: string,
): Promise<{
  ok: boolean
  status: 'synced' | 'noop' | 'error'
  entriesSynced: number
  detail?: string
}> {
  const admin = createAdminClient()

  // Pull business + Vapi config
  const { data: business } = await admin
    .from('businesses')
    .select('id, vapi_agent_id')
    .eq('id', businessId)
    .limit(1)
    .maybeSingle()
  if (!business) {
    return { ok: false, status: 'error', entriesSynced: 0, detail: 'business_not_found' }
  }
  const vapiAssistantId = (business.vapi_agent_id as string | null) ?? null
  if (!vapiAssistantId) {
    // No agent yet — that's not an error, but we mark as synced so the
    // pending-pump can stop trying. The next time the agent is built
    // we'll resync from the create flow.
    await admin
      .from('businesses')
      .update({ kb_sync_status: 'synced', kb_last_synced_at: new Date().toISOString() })
      .eq('id', businessId)
    return { ok: true, status: 'noop', entriesSynced: 0, detail: 'no_vapi_agent' }
  }

  const apiKey = process.env.VAPI_API_KEY
  if (!apiKey) {
    await admin.from('businesses').update({ kb_sync_status: 'error' }).eq('id', businessId)
    return { ok: false, status: 'error', entriesSynced: 0, detail: 'vapi_api_key_missing' }
  }

  // Flip status to 'syncing' so concurrent runs see we're in flight.
  await admin
    .from('businesses')
    .update({ kb_sync_status: 'syncing' })
    .eq('id', businessId)

  const { data: entries, error: entriesErr } = await admin
    .from('knowledge_base_entries')
    .select('category, question, answer, sort_order')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })

  if (entriesErr) {
    await admin.from('businesses').update({ kb_sync_status: 'error' }).eq('id', businessId)
    await admin.from('knowledge_base_sync_log').insert({
      business_id: businessId, status: 'failed', entries_synced: 0, error_message: entriesErr.message,
    })
    return { ok: false, status: 'error', entriesSynced: 0, detail: entriesErr.message }
  }

  const typedEntries = (entries ?? []) as KbEntry[]

  // Fetch current Vapi assistant + preserve all existing prompt content
  const getRes = await fetch(`https://api.vapi.ai/assistant/${vapiAssistantId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!getRes.ok) {
    const errBody = await getRes.text().catch(() => '')
    await admin.from('businesses').update({ kb_sync_status: 'error' }).eq('id', businessId)
    await admin.from('knowledge_base_sync_log').insert({
      business_id: businessId, status: 'failed', entries_synced: 0,
      error_message: `Vapi GET ${getRes.status}: ${errBody.slice(0, 200)}`,
    })
    return { ok: false, status: 'error', entriesSynced: 0, detail: `vapi_get_${getRes.status}` }
  }
  const agent = await getRes.json() as {
    model?: { provider?: string; model?: string; systemPrompt?: string; temperature?: number; tools?: unknown[] }
  }
  const currentPrompt = agent.model?.systemPrompt ?? ''

  const { next: updatedPrompt, changed } = injectKbBlock(currentPrompt, typedEntries)

  if (!changed) {
    // Already in sync — just stamp and exit.
    await admin
      .from('businesses')
      .update({ kb_sync_status: 'synced', kb_last_synced_at: new Date().toISOString() })
      .eq('id', businessId)
    await admin.from('knowledge_base_sync_log').insert({
      business_id: businessId, status: 'success', entries_synced: typedEntries.length,
    })
    return { ok: true, status: 'noop', entriesSynced: typedEntries.length }
  }

  // PATCH with the existing model block + updated systemPrompt. We
  // preserve provider/model/temperature/tools verbatim so we never
  // accidentally retune the agent.
  const patchRes = await fetch(`https://api.vapi.ai/assistant/${vapiAssistantId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: {
        provider: agent.model?.provider ?? 'openai',
        model: agent.model?.model ?? 'gpt-4o',
        systemPrompt: updatedPrompt,
        temperature: agent.model?.temperature ?? 0.5,
        ...(Array.isArray(agent.model?.tools) ? { tools: agent.model?.tools } : {}),
      },
    }),
  })

  if (!patchRes.ok) {
    const errBody = await patchRes.text().catch(() => '')
    await admin.from('businesses').update({ kb_sync_status: 'error' }).eq('id', businessId)
    await admin.from('knowledge_base_sync_log').insert({
      business_id: businessId, status: 'failed', entries_synced: 0,
      error_message: `Vapi PATCH ${patchRes.status}: ${errBody.slice(0, 200)}`,
    })
    return { ok: false, status: 'error', entriesSynced: 0, detail: `vapi_patch_${patchRes.status}` }
  }

  await admin
    .from('businesses')
    .update({ kb_sync_status: 'synced', kb_last_synced_at: new Date().toISOString() })
    .eq('id', businessId)
  await admin.from('knowledge_base_sync_log').insert({
    business_id: businessId, status: 'success', entries_synced: typedEntries.length,
  })

  return { ok: true, status: 'synced', entriesSynced: typedEntries.length }
}

export async function POST(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const result = await performKbSync(auth.businessId)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.detail ?? 'sync_failed' }, { status: 502 })
  }
  return NextResponse.json({
    ok: true,
    status: result.status,
    entriesSynced: result.entriesSynced,
  })
}
