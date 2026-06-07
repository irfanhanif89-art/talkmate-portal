import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { AGENT_CONFIG_STANDARD } from '@/lib/agent-config-standard'
import { buildTool, toolName, type VapiTool } from '@/lib/vapi-tool-defs'

// ---------- types ----------

interface VipCaller {
  phone: string
  name: string | null
  note: string | null
  action: string | null
  active: boolean | null
  transfer_to_member_id: string | null
}

interface TeamMember {
  id: string
  name: string
  role: string | null
  phone: string | null
}

// ---------- tool definitions ----------

// Session 28 (H10) — TOOL_DEFS, toolName, wrapsParams, buildParameters,
// buildTool all live in /lib/vapi-tool-defs.ts now. Both
// /api/vapi/sync and /api/admin/vapi/sync import from there to keep a
// single source of truth.

// ---------- VIP system prompt block ----------

const VIP_BLOCK_HEADER = '====================================================='
const VIP_BLOCK_TITLE = 'VIP CALLER LOOKUP - MANDATORY ON EVERY CALL'

function buildVipBlock(): string {
  return [
    VIP_BLOCK_HEADER,
    VIP_BLOCK_TITLE,
    VIP_BLOCK_HEADER,
    'At the very start of every call (before greeting), call check_caller with the caller\'s phone number.',
    '- If is_vip = true: address them by name immediately. Follow any VIP note or action exactly. If action = "transfer", transfer to the team member specified.',
    '- If is_existing = true and is_vip = false: greet normally, do not ask for their name again.',
    '- If is_repeat = true: acknowledge naturally.',
    '- If lookup fails: proceed with normal greeting. Never mention the lookup.',
  ].join('\n')
}

function injectOrReplaceVipBlock(prompt: string): { next: string; changed: boolean } {
  const block = buildVipBlock()
  // Match an existing VIP block: from the header line(s) through the
  // line above the next blank-line section.
  const vipRe = /={3,}\s*\n\s*VIP CALLER LOOKUP[\s\S]*?(?:\n\s*\n|$)/i
  if (vipRe.test(prompt)) {
    const replaced = prompt.replace(vipRe, block + '\n\n')
    return { next: replaced, changed: replaced !== prompt }
  }
  // Insert before GREETING BEHAVIOUR: if present, otherwise prepend.
  const greetingIdx = prompt.search(/^\s*GREETING BEHAVIOUR:/im)
  if (greetingIdx >= 0) {
    const next = prompt.slice(0, greetingIdx) + block + '\n\n' + prompt.slice(greetingIdx)
    return { next, changed: true }
  }
  const next = block + '\n\n' + prompt
  return { next, changed: true }
}

// ---------- Session 14 — distance quoting prompt block ----------

const QUOTE_BLOCK_HEADER = 'DISTANCE QUOTING:'

function buildQuoteBlock(): string {
  return [
    'DISTANCE QUOTING:',
    'You can calculate job quotes for callers. Before quoting:',
    '1. Confirm whether the caller is an account/trade customer or a private/retail customer.',
    '2. Ask what truck type is needed (tilt tray loaded, tilt tray empty, or sideloader).',
    '3. Get the full pickup address and dropoff address.',
    '4. Call calculate_job_quote with all details.',
    '5. If the function returns quoted: true, read out the distance, ETA, and price naturally.',
    '6. Ask if there are any extras (waiting time, tolls, door direction changes).',
    '7. If yes to extras, call log_quote_addon for each one and state the updated total.',
    '8. State the quote is valid for the duration the function returned.',
    '9. If the function returns quoted: false with reason poa, tell the caller it is priced on application and offer a callback.',
    '10. If the function returns quoted: false with reason outside_service_area, politely advise the location is outside the service area.',
    '11. If the function returns quoted: false with reason address_unclear, ask the caller to confirm the address before proceeding.',
  ].join('\n')
}

// Match the entire DISTANCE QUOTING section (header + lines until blank line or EOF).
const QUOTE_BLOCK_RE = /^DISTANCE QUOTING:[\s\S]*?(?:\n\s*\n|$)/m

function injectQuoteBlock(prompt: string): { next: string; changed: boolean } {
  const block = buildQuoteBlock()
  if (QUOTE_BLOCK_RE.test(prompt)) {
    const replaced = prompt.replace(QUOTE_BLOCK_RE, block + '\n\n')
    return { next: replaced, changed: replaced !== prompt }
  }
  // Append at the end (still readable for the model; existing sections stay untouched).
  const trimmed = prompt.replace(/\s+$/, '')
  const next = `${trimmed}\n\n${block}\n`
  return { next, changed: true }
}

function removeQuoteBlock(prompt: string): { next: string; changed: boolean } {
  if (!QUOTE_BLOCK_RE.test(prompt)) return { next: prompt, changed: false }
  const next = prompt.replace(QUOTE_BLOCK_RE, '')
  return { next, changed: next !== prompt }
}

// Sessions 36-37 — dispatcher integration prompt block. Injected only
// when businesses.dispatch_enabled is true. Mirrors the admin sync.
function buildDispatchBlock(): string {
  return [
    'DISPATCHER INTEGRATION:',
    'When you book a tow job for this business (the dispatcher is enabled):',
    'After creating the booking via create_booking, immediately call create_dispatch_job with:',
    '- job_type: the type of job (tow, roadside, accident_recovery, etc.)',
    '- pickup_address: exact address from the caller',
    '- customer_name and customer_phone from the call',
    '- vehicle_make, vehicle_model, vehicle_colour, vehicle_rego if the caller provided them',
    '- special_instructions: any special notes (needs flatbed, car in water, keys in vehicle, etc.)',
    '- payment_type: account, insurance, cash, or card if discussed',
    '- quoted_amount: if you quoted a price during the call',
    '- booking_id: the booking_id returned by create_booking',
    'Do not mention the dispatch process to the caller. Simply confirm the booking.',
  ].join('\n')
}
const DISPATCH_BLOCK_RE = /^DISPATCHER INTEGRATION:[\s\S]*?(?:\n\s*\n|$)/m
function injectDispatchBlock(prompt: string): { next: string; changed: boolean } {
  const block = buildDispatchBlock()
  if (DISPATCH_BLOCK_RE.test(prompt)) {
    const replaced = prompt.replace(DISPATCH_BLOCK_RE, block + '\n\n')
    return { next: replaced, changed: replaced !== prompt }
  }
  const trimmed = prompt.replace(/\s+$/, '')
  return { next: `${trimmed}\n\n${block}\n`, changed: true }
}
function removeDispatchBlock(prompt: string): { next: string; changed: boolean } {
  if (!DISPATCH_BLOCK_RE.test(prompt)) return { next: prompt, changed: false }
  const next = prompt.replace(DISPATCH_BLOCK_RE, '')
  return { next, changed: next !== prompt }
}

// ---------- Session 15 — VIP bypass prompt block (all plans) ----------

function buildVipBypassBlock(): string {
  return [
    'VIP CALLER HANDLING:',
    'If check_caller returns caller_type: "vip_bypass":',
    '1. Do not greet the caller or speak.',
    '2. Immediately transfer the call to the transfer_number returned.',
    '3. If the transfer fails or is not answered, try once more immediately.',
    '4. If the second transfer also fails, answer the call and say:',
    '   "Hi [vip_name], this is [business_name]. The owner is not available right now. Can I take a message or help you with anything?"',
    '5. Take a message and log it with outcome: vip_message_taken.',
    '6. After the call, send an SMS to the owner with the VIP\'s name, number, and message summary.',
  ].join('\n')
}
const VIP_BYPASS_RE = /^VIP CALLER HANDLING:[\s\S]*?(?:\n\s*\n|$)/m
function injectVipBypassBlock(prompt: string): { next: string; changed: boolean } {
  const block = buildVipBypassBlock()
  if (VIP_BYPASS_RE.test(prompt)) {
    const replaced = prompt.replace(VIP_BYPASS_RE, block + '\n\n')
    return { next: replaced, changed: replaced !== prompt }
  }
  const trimmed = prompt.replace(/\s+$/, '')
  return { next: `${trimmed}\n\n${block}\n`, changed: true }
}

// ---------- Session 15 — Scheduler + waitlist prompt block (Growth/Pro) ----------

function buildSchedulerBlock(): string {
  return [
    'SCHEDULER AND BOOKINGS:',
    'When a caller wants to book a job or appointment:',
    '1. Call check_availability with the requested date and time.',
    '2. If available: collect all required details and call create_booking.',
    '3. If not available: offer the next available slot from the response.',
    '4. If no slots fit at all: offer to add the caller to the waitlist by calling add_to_waitlist.',
    '5. After a booking is confirmed: advise the caller they will receive an SMS confirmation.',
    '',
    'WAITLIST:',
    'When offering the waitlist say: "We are fully booked for that time, but I can add you to our waitlist. If a slot opens up, we will SMS you straight away and give you 30 minutes to confirm. Would you like to be added?"',
    'If yes: call add_to_waitlist.',
    '',
    'CANCELLATIONS AND RESCHEDULES:',
    'If the caller wants to cancel: call cancel_booking with the booking_id (if they know it) or caller_phone.',
    'If the caller wants to reschedule: call reschedule_booking with the new date and time.',
  ].join('\n')
}
const SCHEDULER_RE = /^SCHEDULER AND BOOKINGS:[\s\S]*?(?:\n\s*\n|$)/m
function injectSchedulerBlock(prompt: string): { next: string; changed: boolean } {
  const block = buildSchedulerBlock()
  if (SCHEDULER_RE.test(prompt)) {
    const replaced = prompt.replace(SCHEDULER_RE, block + '\n\n')
    return { next: replaced, changed: replaced !== prompt }
  }
  const trimmed = prompt.replace(/\s+$/, '')
  return { next: `${trimmed}\n\n${block}\n`, changed: true }
}
function removeSchedulerBlock(prompt: string): { next: string; changed: boolean } {
  if (!SCHEDULER_RE.test(prompt)) return { next: prompt, changed: false }
  const next = prompt.replace(SCHEDULER_RE, '')
  return { next, changed: next !== prompt }
}

// ---------- route ----------

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: business } = await supabase.from('businesses').select('*').eq('owner_user_id', user.id).maybeSingle()
  if (!business?.vapi_agent_id) return NextResponse.json({ error: 'No Vapi agent configured' }, { status: 400 })

  const apiKey = process.env.VAPI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'VAPI_API_KEY not configured' }, { status: 500 })

  // Fetch current Vapi assistant — preserve existing prompt, don't rebuild
  const getRes = await fetch('https://api.vapi.ai/assistant/' + business.vapi_agent_id, {
    headers: { 'Authorization': 'Bearer ' + apiKey }
  })
  if (!getRes.ok) return NextResponse.json({ error: 'Failed to fetch Vapi assistant' }, { status: 500 })
  const agent = await getRes.json()

  const currentPrompt: string = agent.model?.systemPrompt || ''
  const currentProvider: string = agent.model?.provider || 'openai'
  const currentModel: string = agent.model?.model || 'gpt-4o'
  const currentTemp: number = agent.model?.temperature ?? 0.5
  const existingTools: VapiTool[] = Array.isArray(agent.model?.tools) ? (agent.model.tools as VapiTool[]) : []

  let updatedPrompt = currentPrompt
  const fieldsUpdated: string[] = []

  // ---- Recording disclosure (existing behaviour preserved) ----
  const disclosureEnabled = business.call_recording_disclosure_enabled !== false
  const disclosureText = (business.call_recording_disclosure_text as string) ||
    'Thank you for calling. This call may be recorded for quality and training purposes.'
  const disclosureLine = `RECORDING DISCLOSURE: At the very start of every call, before saying anything else, say exactly: "${disclosureText}"`

  const hasDisclosure = /RECORDING DISCLOSURE:/i.test(updatedPrompt)
  const hasRecordingMention = /\brecord(ed|ing)\b/i.test(updatedPrompt)

  if (disclosureEnabled && !hasDisclosure && !hasRecordingMention) {
    const firstSectionMatch = updatedPrompt.match(/\n([A-Z][A-Z\s]+:)/)
    if (firstSectionMatch && firstSectionMatch.index !== undefined) {
      updatedPrompt =
        updatedPrompt.slice(0, firstSectionMatch.index + 1) +
        disclosureLine + '\n\n' +
        updatedPrompt.slice(firstSectionMatch.index + 1)
    } else {
      updatedPrompt = disclosureLine + '\n\n' + updatedPrompt
    }
    fieldsUpdated.push('recording_disclosure_added')
  } else if (!disclosureEnabled && hasDisclosure) {
    updatedPrompt = updatedPrompt
      .split('\n')
      .filter(line => !/^RECORDING DISCLOSURE:/i.test(line))
      .join('\n')
    fieldsUpdated.push('recording_disclosure_removed')
  }

  // ---- VIP / team data ----
  const admin = createAdminClient()
  const [vipRes, teamRes] = await Promise.all([
    admin
      .from('vip_callers')
      .select('phone, name, note, action, active, transfer_to_member_id')
      .eq('client_id', business.id)
      .eq('active', true),
    admin
      .from('team_members')
      .select('id, name, role, phone')
      .eq('client_id', business.id),
  ])
  const vipCallers = (vipRes.data ?? []) as VipCaller[]
  const teamMembers = (teamRes.data ?? []) as TeamMember[]

  // ---- VIP block in system prompt ----
  const vipResult = injectOrReplaceVipBlock(updatedPrompt)
  if (vipResult.changed) {
    updatedPrompt = vipResult.next
    fieldsUpdated.push('vip_block_refreshed')
  }

  // ---- Tools ----
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au'
  const webhookSecret = process.env.VAPI_WEBHOOK_SECRET
  const serverUrl = appUrl + '/api/vapi/functions'

  const template = existingTools.find(t => toolName(t) === 'check_caller') ?? null
  // Session 28 (H10): tool groupings now sourced from
  // AGENT_CONFIG_STANDARD.tools so the validator and the sync routes
  // can never drift. Growth/Pro get booking + quoting; Starter gets
  // the four required core tools only.
  const plan = (business.plan as string | null) ?? 'starter'
  const quoteToolsEnabled = plan === 'growth' || plan === 'pro'
  const dispatchEnabled = (business as { dispatch_enabled?: boolean }).dispatch_enabled === true
  const baseTools = [...AGENT_CONFIG_STANDARD.tools.required]
  const bookingTools = [...AGENT_CONFIG_STANDARD.tools.requiredForBookings]
  const quoteTools = [...AGENT_CONFIG_STANDARD.tools.requiredForQuoting]
  const dispatchTools = [...AGENT_CONFIG_STANDARD.tools.requiredForDispatch]
  // Sessions 36-37 — create_dispatch_job is gated on
  // businesses.dispatch_enabled. Non-dispatch agents never see it.
  const ensured = quoteToolsEnabled
    ? [...baseTools, ...bookingTools, ...quoteTools, ...(dispatchEnabled ? dispatchTools : [])]
    : baseTools

  let toolsChanged = false
  const nextTools: VapiTool[] = existingTools.slice()
  for (const fn of ensured) {
    const built = buildTool(fn, business.id, template, { serverUrl, serverSecret: webhookSecret })
    const idx = nextTools.findIndex(t => toolName(t) === fn)
    if (idx === -1) {
      nextTools.push(built)
      toolsChanged = true
    } else {
      // Replace only if the serialised shape differs, to avoid noise.
      if (JSON.stringify(nextTools[idx]) !== JSON.stringify(built)) {
        nextTools[idx] = built
        toolsChanged = true
      }
    }
  }
  // Strip booking + quoting tools on Starter — handles plan downgrades cleanly.
  if (!quoteToolsEnabled) {
    for (const fn of [...bookingTools, ...quoteTools, ...dispatchTools]) {
      const idx = nextTools.findIndex(t => toolName(t) === fn)
      if (idx !== -1) {
        nextTools.splice(idx, 1)
        toolsChanged = true
      }
    }
  } else if (!dispatchEnabled) {
    // Sessions 36-37 — dispatch turned off but bookings still on.
    // Strip only the dispatch tools.
    for (const fn of dispatchTools) {
      const idx = nextTools.findIndex(t => toolName(t) === fn)
      if (idx !== -1) {
        nextTools.splice(idx, 1)
        toolsChanged = true
      }
    }
  }
  if (toolsChanged) fieldsUpdated.push('tools_updated')

  // ---- DISTANCE QUOTING prompt block (Growth/Pro only) ----
  if (quoteToolsEnabled) {
    const quoteResult = injectQuoteBlock(updatedPrompt)
    if (quoteResult.changed) {
      updatedPrompt = quoteResult.next
      fieldsUpdated.push('quote_block_added')
    }
  } else {
    const quoteResult = removeQuoteBlock(updatedPrompt)
    if (quoteResult.changed) {
      updatedPrompt = quoteResult.next
      fieldsUpdated.push('quote_block_removed')
    }
  }

  // ---- DISPATCHER INTEGRATION prompt block (dispatch_enabled only) ----
  if (dispatchEnabled) {
    const dispatchResult = injectDispatchBlock(updatedPrompt)
    if (dispatchResult.changed) {
      updatedPrompt = dispatchResult.next
      fieldsUpdated.push('dispatch_block_added')
    }
  } else {
    const dispatchResult = removeDispatchBlock(updatedPrompt)
    if (dispatchResult.changed) {
      updatedPrompt = dispatchResult.next
      fieldsUpdated.push('dispatch_block_removed')
    }
  }

  // ---- VIP BYPASS prompt block (all plans) ----
  const vipBypassResult = injectVipBypassBlock(updatedPrompt)
  if (vipBypassResult.changed) {
    updatedPrompt = vipBypassResult.next
    fieldsUpdated.push('vip_bypass_block_added')
  }

  // ---- SCHEDULER prompt block (Growth/Pro only) ----
  if (quoteToolsEnabled) {
    const schedResult = injectSchedulerBlock(updatedPrompt)
    if (schedResult.changed) {
      updatedPrompt = schedResult.next
      fieldsUpdated.push('scheduler_block_added')
    }
  } else {
    const schedResult = removeSchedulerBlock(updatedPrompt)
    if (schedResult.changed) {
      updatedPrompt = schedResult.next
      fieldsUpdated.push('scheduler_block_removed')
    }
  }

  // ---- Build PATCH body ----
  const promptChanged = updatedPrompt !== currentPrompt
  const patchBody: Record<string, unknown> = {}
  if (promptChanged || toolsChanged) {
    patchBody.model = {
      provider: currentProvider,
      model: currentModel,
      systemPrompt: updatedPrompt,
      temperature: currentTemp,
      tools: nextTools,
    }
  }

  // Ensure end-of-call-report reaches the full ingestion handler
  // (/api/webhooks/vapi), authenticated with the webhook secret. Mid-call
  // function calls keep using their own per-tool /api/vapi/functions server
  // (set on each tool above), so this assistant-level config is ONLY for the
  // lifecycle webhook. A 2026-06 batch agent operation wiped serverUrlSecret
  // and pointed serverUrl at /api/vapi/functions (which does NOT handle
  // end-of-call-report), silently dropping every call for 9 days. Heal any
  // drift on every sync rather than only when a field happens to be empty.
  const desiredServerUrl = appUrl + '/api/webhooks/vapi'
  if (agent.serverUrl !== desiredServerUrl) {
    patchBody.serverUrl = desiredServerUrl
    fieldsUpdated.push('serverUrl')
  }
  // serverUrlSecret is redacted on GET, so always re-assert it when we hold
  // the secret — guarantees it can never silently fall back to blank.
  if (webhookSecret) {
    patchBody.serverUrlSecret = webhookSecret
    fieldsUpdated.push('serverUrlSecret')
  }
  const desiredServerMessages = ['end-of-call-report', 'status-update']
  const currentMsgs = Array.isArray(agent.serverMessages) ? [...agent.serverMessages].sort() : []
  if (currentMsgs.join(',') !== [...desiredServerMessages].sort().join(',')) {
    patchBody.serverMessages = desiredServerMessages
    fieldsUpdated.push('serverMessages')
  }
  // Clear the modern `server` object if present: this account authenticates
  // via legacy serverUrl/serverUrlSecret, and a secretless `server` object
  // would shadow them and re-break ingestion.
  if (agent.server) {
    patchBody.server = null
    fieldsUpdated.push('server_cleared')
  }

  // Side info that's worth surfacing in the response even when no PATCH
  // is required, so the UI can confirm what was considered.
  const meta = {
    vip_count: vipCallers.length,
    team_count: teamMembers.length,
  }

  if (Object.keys(patchBody).length === 0) {
    // Still stamp the timestamp so the UI shows a fresh "last synced".
    await stampLastSynced(admin, business.id)
    return NextResponse.json({ success: true, message: 'No changes needed', fieldsUpdated: [], meta })
  }

  const patchRes = await fetch('https://api.vapi.ai/assistant/' + business.vapi_agent_id, {
    method: 'PATCH',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(patchBody),
  })

  if (!patchRes.ok) {
    const err = await patchRes.text()
    return NextResponse.json({ error: 'Vapi PATCH failed: ' + err }, { status: 500 })
  }

  await stampLastSynced(admin, business.id)
  return NextResponse.json({ success: true, fieldsUpdated, meta })
}

async function stampLastSynced(admin: ReturnType<typeof createAdminClient>, businessId: string) {
  // Migration 029 adds this column. We swallow the error if the migration
  // hasn't run yet so the sync itself never appears to fail.
  try {
    await admin
      .from('businesses')
      .update({ agent_last_synced_at: new Date().toISOString() })
      .eq('id', businessId)
  } catch (e) {
    console.error('[vapi/sync] stamp agent_last_synced_at failed', e)
  }
}
