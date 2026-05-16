import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// ---------- types ----------

interface VapiToolFunction {
  name?: string
  description?: string
  parameters?: Record<string, unknown>
}

interface VapiTool {
  type?: string
  function?: VapiToolFunction
  server?: { url?: string; secret?: string } | null
  // Some older Vapi shapes have these at the top level
  name?: string
  description?: string
  parameters?: Record<string, unknown>
  serverUrl?: string
  serverUrlSecret?: string
  // Allow passthrough of unknown fields (async, messages, etc.)
  [k: string]: unknown
}

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

// JSON-schema-style parameter blocks used inside each tool. Each tool's
// `function.parameters` is a flat object schema with the args the model
// should pass; the /api/vapi/functions endpoint reads them off the
// request body. We keep the wrapped { function_name, business_id, params }
// shape only when the existing check_caller template already uses it
// (see `wrapParams` below).
const TOOL_DEFS: Record<string, { description: string; properties: Record<string, unknown>; required: string[] }> = {
  check_caller: {
    description: 'Look up an incoming caller by phone to surface VIP status, prior history, and repeat-caller flags. Call this once at the very start of every call before greeting.',
    properties: {
      phone: { type: 'string', description: "The caller's phone number in E.164 or local format" },
    },
    required: ['phone'],
  },
  log_outcome: {
    description: 'Log the outcome of the current call so the portal can update analytics and CRM records.',
    properties: {
      call_id: { type: 'string', description: "The current Vapi call id (e.g. 'call_xxx')" },
      outcome: { type: 'string', description: 'Short outcome label, e.g. transferred, message_taken, booking_created, callback_scheduled' },
      transfer_to: { type: 'string', description: 'Name or role of the team member the call was transferred to, if any' },
      transfer_success: { type: 'boolean', description: 'Whether the transfer actually connected' },
      summary: { type: 'string', description: 'One-sentence summary of what the caller wanted' },
    },
    required: ['call_id'],
  },
  get_team: {
    description: 'Fetch the active team members so the assistant can transfer a caller to the right person. Optionally pass a `query` to bias ordering by name, role, or department.',
    properties: {
      query: { type: 'string', description: "Optional search hint, e.g. 'accountant' or 'Sarah'" },
    },
    required: [],
  },
  schedule_callback: {
    description: 'Schedule a callback for a caller who could not be helped right now.',
    properties: {
      caller_name: { type: 'string', description: "Caller's name" },
      caller_phone: { type: 'string', description: "Caller's phone number" },
      preferred_time: { type: 'string', description: "Caller's preferred callback time (free text or ISO timestamp)" },
      reason: { type: 'string', description: 'Why the caller wants a callback' },
      call_id: { type: 'string', description: 'The current Vapi call id, if available' },
    },
    required: ['caller_phone'],
  },
  // Session 14 — distance quoting (Growth/Pro only; gated below).
  calculate_job_quote: {
    description: 'Calculate a job quote based on pickup and dropoff addresses, truck type, and customer rate type. Call this after confirming the customer type (account or retail) and collecting both addresses.',
    properties: {
      pickup_address: { type: 'string', description: 'The full pickup address as given by the caller' },
      dropoff_address: { type: 'string', description: 'The full dropoff address as given by the caller' },
      truck_type: {
        type: 'string',
        enum: ['loaded_tilt_tray', 'empty_tilt_tray', 'sideloader_40ft'],
        description: 'The type of truck required for the job',
      },
      rate_type: {
        type: 'string',
        enum: ['account', 'retail'],
        description: 'account for trade/account customers, retail for private customers',
      },
      caller_phone: { type: 'string', description: "The caller's phone number" },
      call_id: { type: 'string', description: 'The Vapi call ID for this call' },
    },
    required: ['pickup_address', 'dropoff_address', 'truck_type', 'rate_type'],
  },
  log_quote_addon: {
    description: 'Append an add-on (waiting time, toll, door direction change, futile trip) to an existing quote and return the updated total. Call this for each add-on the caller confirms after the initial quote.',
    properties: {
      quote_id: { type: 'string', description: 'The quote id returned by calculate_job_quote' },
      addon_name: { type: 'string', description: 'The exact name of the add-on as it appears in the services list (e.g. "Waiting Time - Loaded Tilt Tray")' },
      quantity: { type: 'number', description: 'Units of the add-on. Defaults to 1.' },
    },
    required: ['quote_id', 'addon_name'],
  },
}

// ---------- helpers ----------

function toolName(tool: VapiTool | null | undefined): string | null {
  if (!tool) return null
  return tool.function?.name ?? tool.name ?? null
}

// If the existing check_caller template already uses the wrapped
// `{ function_name, business_id, params }` parameter shape (the way the
// /api/vapi/functions endpoint reads its body), mirror that for the new
// tools. Otherwise emit a flat schema.
function wrapsParams(template: VapiTool | null): boolean {
  const params = (template?.function?.parameters ?? template?.parameters) as Record<string, unknown> | undefined
  const properties = params?.properties as Record<string, unknown> | undefined
  return !!(properties && 'function_name' in properties && 'business_id' in properties && 'params' in properties)
}

function buildParameters(
  functionName: string,
  businessId: string,
  template: VapiTool | null,
): Record<string, unknown> {
  const def = TOOL_DEFS[functionName]
  if (wrapsParams(template)) {
    return {
      type: 'object',
      properties: {
        function_name: { type: 'string', enum: [functionName], description: `Always set to "${functionName}"` },
        business_id: { type: 'string', enum: [businessId], description: 'Always pass the business id baked into this tool' },
        params: {
          type: 'object',
          properties: def.properties,
          required: def.required,
        },
      },
      required: ['function_name', 'business_id', 'params'],
    }
  }
  return {
    type: 'object',
    properties: def.properties,
    required: def.required,
  }
}

function buildTool(
  functionName: string,
  businessId: string,
  template: VapiTool | null,
  defaults: { serverUrl: string; serverSecret: string | undefined },
): VapiTool {
  const def = TOOL_DEFS[functionName]
  const parameters = buildParameters(functionName, businessId, template)

  // Clone the template envelope so we keep `messages`, `async`, custom
  // headers, etc., then override the function body. Default to the
  // documented Vapi v2 shape if there's no template.
  const base: VapiTool = template
    ? JSON.parse(JSON.stringify(template))
    : {
        type: 'function',
        server: { url: defaults.serverUrl, secret: defaults.serverSecret },
      }

  // Make sure server URL/secret are set even when we cloned a template
  // that omitted them.
  if (base.server || (base.serverUrl == null && base.serverUrlSecret == null)) {
    base.server = {
      url: base.server?.url ?? defaults.serverUrl,
      secret: base.server?.secret ?? defaults.serverSecret,
    }
  }

  base.type = base.type ?? 'function'
  base.function = {
    name: functionName,
    description: def.description,
    parameters,
  }
  // Some shapes mirror the name at the top level — keep it consistent.
  if (base.name !== undefined) base.name = functionName

  return base
}

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

// ---------- route ----------

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: business } = await supabase.from('businesses').select('*').eq('owner_user_id', user.id).single()
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
  // Quote tools are Growth/Pro only. Starter plans get them stripped if
  // present so a downgrade cleans up properly.
  const plan = (business.plan as string | null) ?? 'starter'
  const quoteToolsEnabled = plan === 'growth' || plan === 'pro' || plan === 'professional'
  const baseTools = ['check_caller', 'log_outcome', 'get_team', 'schedule_callback']
  const quoteTools = ['calculate_job_quote', 'log_quote_addon']
  const ensured = quoteToolsEnabled ? [...baseTools, ...quoteTools] : baseTools

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
  // Strip quote tools on Starter — handles plan downgrades cleanly.
  if (!quoteToolsEnabled) {
    for (const fn of quoteTools) {
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

  // Ensure serverUrl and serverUrlSecret are configured on the assistant
  if (!agent.serverUrl) {
    patchBody.serverUrl = appUrl + '/api/webhooks/vapi'
    fieldsUpdated.push('serverUrl')
  }
  if (!agent.serverUrlSecret && webhookSecret) {
    patchBody.serverUrlSecret = webhookSecret
    fieldsUpdated.push('serverUrlSecret')
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
