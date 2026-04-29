import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { grokJson, GrokError } from '@/lib/grok'
import { getPlan } from '@/lib/plan'
import { handleContactLookup, handleContactListQuery, handlePipelineQuery, extractNameFromIntent } from '@/lib/command-crm-handlers'

interface ParsedIntent {
  intent: string
  requiresConfirmation: boolean
  confirmationMessage?: string
  responseMessage: string
  actionParams?: Record<string, unknown>
}

const HIGH_RISK = new Set(['send_invoice', 'delete_item', 'update_pricing', 'refund', 'pause_agent', 'resume_agent', 'update_menu', 'update_hours', 'contact_tag_update'])
const SAFE = new Set(['query_analytics', 'get_call_summary', 'get_missed_calls', 'get_busiest_hours', 'contact_lookup', 'contact_list_query', 'pipeline_query'])

function buildSystemPrompt(ctx: {
  businessName: string
  industry: string
  plan: string
  callsToday: number
  callsMonth: number
  revenueToday: number
}) {
  const now = new Date()
  return `You are TalkMate Command, an AI business assistant for ${ctx.businessName}.
Today is ${now.toISOString().slice(0, 10)} (${Intl.DateTimeFormat().resolvedOptions().timeZone}).

Business context:
- Industry: ${ctx.industry}
- Plan: ${ctx.plan}
- Calls today: ${ctx.callsToday}
- Revenue today: $${ctx.revenueToday}
- Calls this month: ${ctx.callsMonth}

You help the business owner manage their TalkMate account via natural language commands.

ALWAYS respond in this JSON format:
{
  "intent": "query_analytics" | "send_invoice" | "update_menu" | "update_hours" | "pause_agent" | "resume_agent" | "get_call_summary" | "get_missed_calls" | "get_busiest_hours" | "contact_lookup" | "contact_list_query" | "pipeline_query" | "contact_tag_update" | "unknown",
  "requiresConfirmation": true|false,
  "confirmationMessage": "string (shown to user before executing)",
  "responseMessage": "string (friendly response to send back)",
  "actionParams": {}
}

CRM intents (Session 2):
- contact_lookup: "Find Mike", "Who is Sarah", "Has James called before". actionParams: { name: "..." }
- contact_list_query: "Show me lapsed regulars", "Who are my top callers", "Show me complaints". actionParams: { listName: "..." } (smart-list name guess)
- pipeline_query: "How many leads in my pipeline", "Who's at Inspection Booked", "Show me hot leads". actionParams: { stage?: "..." }
- contact_tag_update: "Tag Sarah as VIP", "Mark John as complaint", "Add note to Mike". actionParams: { name: "...", tag?: "...", note?: "..." }

contact_lookup, contact_list_query, pipeline_query are READ-ONLY — execute immediately.
contact_tag_update is HIGH RISK — always require confirmation.

For list results, format the responseMessage as a clean numbered list optimised for WhatsApp/Telegram:
"Your top callers (5):
1. Sarah Chen — 12 calls — last 2 days ago
2. ..."

If a list returns more than 10 items, show the first 10 and append "...and N more. Open the portal for the full list."

HIGH RISK actions that ALWAYS require confirmation: send_invoice, delete_item, update_pricing, refund, contact_tag_update.
LOW RISK actions that execute immediately: query_analytics, get_call_summary, contact_lookup, contact_list_query, pipeline_query.
If you cannot understand the command, ask one clarifying question with intent="unknown".
Never guess on financial actions. Never execute destructive actions without confirmation.`
}

// POST /api/command/parse  body: { message, platform, conversationHistory? }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    message?: string
    platform?: 'whatsapp' | 'telegram' | 'portal'
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  }
  const message = (body.message ?? '').trim()
  const platform = body.platform ?? 'portal'
  if (!message) return NextResponse.json({ ok: false, error: 'message required' }, { status: 400 })

  const { data: business } = await supabase.from('businesses')
    .select('id, name, business_type, plan, command_daily_count, command_daily_count_date')
    .eq('owner_user_id', user.id).single()
  if (!business) return NextResponse.json({ ok: false, error: 'No business' }, { status: 404 })

  const plan = getPlan(business.plan)
  if (!plan.hasCommandCentre) {
    return NextResponse.json({ ok: false, error: 'Command Centre is a Growth/Pro feature.' }, { status: 403 })
  }

  // ─ Daily rate limit ─────────────────────────────────────────────────────
  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const dailyLimit = plan.key === 'pro' || plan.key === 'professional' ? null : 50
  let dailyCount = business.command_daily_count_date === today ? (business.command_daily_count ?? 0) : 0
  if (dailyLimit !== null && dailyCount >= dailyLimit) {
    return NextResponse.json({
      ok: false,
      error: `You've reached your daily command limit of ${dailyLimit}. This resets at midnight. Upgrade to Pro for unlimited commands.`,
    }, { status: 429 })
  }

  // ─ Build context ───────────────────────────────────────────────────────
  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const [{ count: callsMonth }, { count: callsToday }] = await Promise.all([
    supabase.from('calls').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', startOfMonth.toISOString()),
    supabase.from('calls').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', todayStart.toISOString()),
  ])

  const systemPrompt = buildSystemPrompt({
    businessName: business.name,
    industry: business.business_type,
    plan: plan.label,
    callsToday: callsToday ?? 0,
    callsMonth: callsMonth ?? 0,
    revenueToday: 0,
  })

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [{ role: 'system', content: systemPrompt }]
  for (const m of body.conversationHistory ?? []) {
    if (m.role === 'user' || m.role === 'assistant') messages.push(m)
  }
  messages.push({ role: 'user', content: message })

  const t0 = Date.now()
  let parsed: ParsedIntent
  try {
    parsed = await grokJson<ParsedIntent>(messages)
  } catch (e) {
    const err = e instanceof GrokError ? e.message : 'Could not parse command'
    return NextResponse.json({ ok: false, error: err }, { status: 502 })
  }
  const responseMs = Date.now() - t0

  // ─ Force confirmation for high-risk intents ─────────────────────────────
  const intent = parsed.intent || 'unknown'
  const isHighRisk = HIGH_RISK.has(intent)
  const requiresConfirmation = isHighRisk || parsed.requiresConfirmation === true

  // ─ CRM read-only intents: fetch real data and override responseMessage ──
  let crmResponseOverride: string | null = null
  try {
    if (intent === 'contact_lookup') {
      const name = extractNameFromIntent(parsed.actionParams, message) ?? ''
      crmResponseOverride = await handleContactLookup(supabase, business.id, name)
    } else if (intent === 'contact_list_query') {
      const hint = (parsed.actionParams?.listName as string | undefined) ?? message
      crmResponseOverride = await handleContactListQuery(supabase, business.id, hint)
    } else if (intent === 'pipeline_query') {
      const stage = (parsed.actionParams?.stage as string | undefined) ?? null
      crmResponseOverride = await handlePipelineQuery(supabase, business.id, stage)
    }
  } catch (e) {
    console.error('[command/parse] CRM handler error', e)
  }

  // ─ Log it ──────────────────────────────────────────────────────────────
  const { data: logRow } = await admin.from('command_logs').insert({
    business_id: business.id,
    user_id: user.id,
    platform,
    raw_command: message,
    parsed_intent: intent,
    action_taken: requiresConfirmation ? 'awaiting_confirmation' : 'executed_immediately',
    outcome: requiresConfirmation ? 'pending_confirmation' : SAFE.has(intent) ? 'success' : intent === 'unknown' ? 'failed' : 'success',
    confirmed: !requiresConfirmation,
    expires_at: requiresConfirmation ? new Date(Date.now() + 10 * 60 * 1000).toISOString() : null,
    response_ms: responseMs,
    metadata: parsed.actionParams ?? {},
  }).select('id').single()

  // Increment daily counter
  await admin.from('businesses').update({
    command_daily_count: dailyCount + 1,
    command_daily_count_date: today,
  }).eq('id', business.id)

  return NextResponse.json({
    ok: true,
    logId: logRow?.id,
    intent,
    requiresConfirmation,
    confirmationMessage: parsed.confirmationMessage ?? null,
    responseMessage: crmResponseOverride ?? parsed.responseMessage,
    responseMs,
  })
}
