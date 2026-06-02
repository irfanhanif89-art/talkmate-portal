// Session 20 — Go-Live auto-check computation.
//
// Pure server-side computation. Reads businesses + calls + bookings +
// sms_log via the service-role client and returns a boolean for each
// of the 12 automated checklist items. Never trust client-submitted
// auto check values: every GET on the checklist endpoint recomputes
// these and writes them back to client_golive_checklist.
//
// Schema notes (brief vs reality):
//   - businesses uses `name` not `business_name`.
//   - `escalation_number` is a top-level column on businesses; the brief
//     refers to `notifications_config.escalation_number` for the match
//     check — we honour that exactly: notifications_config.escalation_number
//     must equal the top-level escalation_number.
//   - There is no `vapi_phone_number` column. The Vapi-assigned number
//     is `agent_phone_number` (admin-set during onboarding) with
//     `talkmate_number` as a fallback.
//   - intelligence_alert_config from Session 18 uses `alert_owner` and
//     `owner_number`. The brief's `.enabled` field doesn't exist; we
//     check `alert_owner === true` AND `owner_number` is set.
//   - intelligence_status values are `resolved | review | critical |
//     pending | error`. The brief's `'scored'` value doesn't exist —
//     "scored" means any of resolved/review/critical (i.e. status is
//     set and isn't pending/error).
//   - sms_log uses `client_id` not `business_id`; status default is
//     'sent'. No 'delivered' state exists in our system.

import type { createAdminClient } from '@/lib/supabase/server'
import { validateAgentConfig } from '@/lib/agent-config-validator'

export const AUTO_CHECK_KEYS = [
  'check_escalation_number',
  'check_notifications_config_match',
  'check_intelligence_alert_config',
  'check_vapi_agent_id',
  'check_vapi_phone_number',
  'check_sms_reset_at',
  'check_account_status',
  'check_plan_set',
  'check_first_call_logged',
  'check_first_booking_created',
  'check_first_sms_sent',
  'check_intelligence_scored',
  // Session 24 — config validation against AGENT_CONFIG_STANDARD.
  // Both require a live Vapi network call so they short-circuit to
  // false when vapi_agent_id is missing.
  'check_agent_config_valid',
  'check_no_placeholder_in_prompt',
  // 2026-06-02 (GM Towing post-mortem) — onboarding-quality gates.
  'check_vip_fastpath_configured',
  'check_template_matches_business',
] as const

export type AutoCheckKey = (typeof AUTO_CHECK_KEYS)[number]

export const MANUAL_CHECK_KEYS = [
  'manual_vapi_functions_registered',
  'manual_test_call_made',
  'manual_agent_greets_correctly',
  'manual_phone_readback_correct',
  'manual_booking_appears_in_portal',
  'manual_sms_delivered_to_owner',
  'manual_after_hours_tested',
  'manual_transfer_tested',
  'manual_client_login_tested',
  'manual_client_walked_through_portal',
  'manual_test_data_cleaned',
  'manual_welcome_email_sent',
] as const

export type ManualCheckKey = (typeof MANUAL_CHECK_KEYS)[number]

export const AUTO_CHECK_LABELS: Record<AutoCheckKey, string> = {
  check_escalation_number:         'Escalation number set (+61 format)',
  check_notifications_config_match: 'Notifications config matches escalation number',
  check_intelligence_alert_config: 'Call intelligence alerts enabled',
  check_vapi_agent_id:             'Vapi agent ID recorded',
  check_vapi_phone_number:         'Vapi phone number recorded',
  check_sms_reset_at:              'SMS reset date configured',
  check_account_status:            'Account status is active',
  check_plan_set:                  'Plan assigned (Starter, Growth, or Pro)',
  check_first_call_logged:         'First real call logged (10s+)',
  check_first_booking_created:     'First booking created',
  check_first_sms_sent:            'First SMS delivered to owner',
  check_intelligence_scored:       'First call intelligence score generated',
  check_agent_config_valid:        'Agent config matches TalkMate standard (voice, tools, timing)',
  check_no_placeholder_in_prompt:  'System prompt has no placeholder text or speech-distorting characters',
  check_vip_fastpath_configured:   'Regulars/VIP list has a working fast-path (recognised + routable)',
  check_template_matches_business: 'FAQs & escalation match the actual business (template was converted)',
}

export const MANUAL_CHECK_LABELS: Record<ManualCheckKey, string> = {
  manual_vapi_functions_registered: 'All Vapi functions registered on assistant (check_caller, create_booking, transferCall etc.)',
  manual_test_call_made:           'Test call made to agent phone number',
  manual_agent_greets_correctly:   'Agent greets with correct business name',
  manual_phone_readback_correct:   'Agent reads phone number back digit by digit',
  manual_booking_appears_in_portal: 'Test booking visible in client portal /bookings',
  manual_sms_delivered_to_owner:   'SMS delivered to owner mobile after test booking',
  manual_after_hours_tested:       'After-hours message tested and working',
  manual_transfer_tested:          'Live transfer to escalation number tested',
  manual_client_login_tested:      'Client can log in to portal successfully',
  manual_client_walked_through_portal: 'Client walked through portal (screen share or in person)',
  manual_test_data_cleaned:        'Test bookings and contacts deleted from database',
  manual_welcome_email_sent:       'Welcome email sent to client',
}

// Plain English remediation hints surfaced in the failed-items box.
export const AUTO_CHECK_REMEDIES: Record<AutoCheckKey, string> = {
  check_escalation_number:         'escalation_number on the businesses row is empty or not in +61 format. Update via Admin > Client > Edit.',
  check_notifications_config_match: 'escalation_number inside notifications_config does not match the top-level escalation_number. Run the fix SQL or update via Settings.',
  check_intelligence_alert_config: 'intelligence_alert_config.alert_owner is not true or owner_number is blank. Update via Settings > Notifications > Call Intelligence Alerts.',
  check_vapi_agent_id:             'vapi_agent_id is missing on the businesses row. Run Sync Agent to create the assistant.',
  check_vapi_phone_number:         'agent_phone_number (or talkmate_number) is empty. Assign the Vapi-provisioned number during onboarding.',
  check_sms_reset_at:              'sms_reset_at is null. This is set automatically on first SMS send; if the column is still null, run a test SMS or set it manually.',
  check_account_status:            'account_status is not active. Activate the account from Admin > Client > Activate.',
  check_plan_set:                  'plan is null or unknown. Assign starter, growth, or pro.',
  check_first_call_logged:         'No real call (10s+) has landed yet. Make a test call to the agent phone number.',
  check_first_booking_created:     'No booking exists yet. Make a test booking through the agent.',
  check_first_sms_sent:            'No SMS has been delivered for this client. Confirm Vapi functions are registered and make a test booking.',
  check_intelligence_scored:       'No call has been scored by Call Intelligence yet. Confirm ANTHROPIC_API_KEY is set and make a >30s test call.',
  check_agent_config_valid:        'Vapi assistant config deviates from AGENT_CONFIG_STANDARD. Check /admin/agent-health for the field-level issue list.',
  check_no_placeholder_in_prompt:  'System prompt contains placeholder text, dollar signs, or ordinal suffixes. Fix the prompt in Vapi and resync.',
  check_vip_fastpath_configured:   'Regulars are loaded as VIP/account callers but none are routable (no account type, no VIP bypass with a live transfer number, no transfer member). They will get the cold script. Fix in Admin > Client > Accounts/VIP — this is the GM Towing failure mode.',
  check_template_matches_business: 'The agent still carries roadside/car-towing FAQs or escalation rules while the catalogue is container/freight — the onboarding template was not converted. Rewrite FAQs & escalation for the real business, or override if intentional.',
}

// E.164 AU mobile: +61 then 9 digits (mobile) or +61 then 9 digits
// (landline two-digit area code + 7 digits). Either way it's +61<9-10 digits>.
function isE164Au(value: unknown): boolean {
  return typeof value === 'string' && /^\+61\d{8,10}$/.test(value)
}

interface BusinessSnapshot {
  id: string
  name: string | null
  plan: string | null
  account_status: string | null
  escalation_number: string | null
  notifications_config: Record<string, unknown> | null
  intelligence_alert_config: Record<string, unknown> | null
  vapi_agent_id: string | null
  agent_phone_number: string | null
  talkmate_number: string | null
  sms_reset_at: string | null
}

export type AutoCheckResult = Record<AutoCheckKey, boolean>

// Computes every auto check for a business. Returns a flat
// AutoCheckResult that can be upserted directly into
// client_golive_checklist.
export async function computeAutoChecks(
  supabase: ReturnType<typeof createAdminClient>,
  businessId: string,
): Promise<{ result: AutoCheckResult; business: BusinessSnapshot | null }> {
  const { data: bizData } = await supabase
    .from('businesses')
    .select('id, name, plan, account_status, escalation_number, notifications_config, intelligence_alert_config, vapi_agent_id, agent_phone_number, talkmate_number, sms_reset_at')
    .eq('id', businessId)
    .maybeSingle()
  const business = (bizData as BusinessSnapshot | null) ?? null

  if (!business) {
    return {
      business: null,
      result: AUTO_CHECK_KEYS.reduce((acc, k) => ({ ...acc, [k]: false }), {} as AutoCheckResult),
    }
  }

  // Side-effect checks run in parallel.
  const [callRes, bookingRes, smsRes, scoredRes] = await Promise.all([
    supabase
      .from('calls')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gt('duration_seconds', 10),
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', businessId),
    supabase
      .from('sms_log')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', businessId)
      .eq('status', 'sent'),
    supabase
      .from('calls')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .in('intelligence_status', ['resolved', 'review', 'critical']),
  ])

  const callCount = callRes.count ?? 0
  const bookingCount = bookingRes.count ?? 0
  const smsCount = smsRes.count ?? 0
  const scoredCount = scoredRes.count ?? 0

  const notifsCfg = (business.notifications_config ?? {}) as Record<string, unknown>

  // 2026-06-02 (GM Towing post-mortem) — onboarding-quality gates.
  // Both read extra rows; fetched here in parallel.
  const [vipRes, onboardRes] = await Promise.all([
    supabase
      .from('vip_callers')
      .select('account_type, vip_bypass, transfer_to_member_id, action')
      .eq('client_id', businessId)
      .eq('active', true),
    supabase
      .from('onboarding_responses')
      .select('responses')
      .eq('business_id', businessId)
      .maybeSingle(),
  ])
  const liveTransferNumber =
    typeof notifsCfg.live_transfer_number === 'string' && notifsCfg.live_transfer_number.trim().length > 0
  const vipFastPathOk = computeVipFastPath(vipRes.data ?? [], liveTransferNumber)
  const templateOk = computeTemplateMatch(
    (onboardRes.data as { responses?: Record<string, unknown> } | null)?.responses ?? null,
  )
  const alertCfg = (business.intelligence_alert_config ?? {}) as Record<string, unknown>

  // Brief: Starter plan auto-passes the intelligence_scored check.
  const isStarter = business.plan === 'starter'

  // Session 24 — Vapi agent config validation. Requires a live network
  // call so we only attempt it when we have a vapi_agent_id and an API
  // key. Failures (no key, Vapi 5xx, missing assistant) leave both
  // checks at false rather than throwing — go-live is the caller and
  // shouldn't see a 500 from this helper.
  //
  // Session 28 (H11): pass business.plan so Starter agents don't fail
  // for missing booking/quoting tools they were never meant to have.
  const { configValid, promptClean } = await validateVapiConfig(business.vapi_agent_id, business.plan)

  const result: AutoCheckResult = {
    check_escalation_number:
      isE164Au(business.escalation_number),

    check_notifications_config_match:
      typeof business.escalation_number === 'string' &&
      business.escalation_number.length > 0 &&
      notifsCfg.escalation_number === business.escalation_number,

    check_intelligence_alert_config:
      alertCfg.alert_owner === true &&
      typeof alertCfg.owner_number === 'string' &&
      (alertCfg.owner_number as string).length > 0,

    check_vapi_agent_id:
      typeof business.vapi_agent_id === 'string' && business.vapi_agent_id.length > 0,

    check_vapi_phone_number:
      (typeof business.agent_phone_number === 'string' && business.agent_phone_number.length > 0) ||
      (typeof business.talkmate_number === 'string' && business.talkmate_number.length > 0),

    check_sms_reset_at:
      business.sms_reset_at !== null,

    check_account_status:
      business.account_status === 'active',

    check_plan_set:
      business.plan === 'starter' || business.plan === 'growth' ||
      business.plan === 'pro',

    check_first_call_logged:
      callCount > 0,

    check_first_booking_created:
      bookingCount > 0,

    check_first_sms_sent:
      smsCount > 0,

    check_intelligence_scored:
      isStarter || scoredCount > 0,

    check_agent_config_valid:
      configValid,

    check_no_placeholder_in_prompt:
      promptClean,

    check_vip_fastpath_configured:
      vipFastPathOk,

    check_template_matches_business:
      templateOk,
  }

  return { business, result }
}

// VIP fast-path gate (GM Towing failure mode). Passes when there is no
// regulars list at all, OR at least one loaded caller gets usable
// recognised handling: a recognised `account`, OR an action that only
// takes a message (no transfer needed), OR a transfer WITH a destination
// (explicit transfer member, or `vip_bypass` + a live transfer number).
// The exact GM bug — every regular a `vip` whose action is `transfer_*`
// with NO destination and no bypass number — fails this check.
export type VipRow = {
  account_type: string | null
  vip_bypass: boolean | null
  transfer_to_member_id: string | null
  action: string | null
}
export function computeVipFastPath(rows: VipRow[], liveTransferNumber: boolean): boolean {
  if (rows.length === 0) return true // nothing loaded — nothing to enforce
  return rows.some(r => {
    if (r.account_type === 'account') return true // recognised trade account
    if (r.action === 'take_message') return true // recognised, message taken — no transfer required
    if (r.transfer_to_member_id) return true // explicit transfer destination
    if (r.vip_bypass === true && liveTransferNumber) return true // bypass to live number
    return false // needs a transfer but has nowhere to send them
  })
}

// Template-match gate. Fails only on the clear contradiction: the
// catalogue is container/freight/haulage while the FAQs or escalation
// rules still carry roadside car-towing language (the un-converted
// template). Conservative by design — passes when there's no onboarding
// data, no freight catalogue, or no roadside phrases — so it blocks the
// GM case without false-flagging genuine roadside towers.
const ROADSIDE_PHRASES = ['racv', 'nrma', 'accident scene', 'freeway', 'flat battery', 'roadside assist']
const FREIGHT_HINTS = ['container', 'freight', 'haulage', 'tilt tray', 'sideloader']
export function computeTemplateMatch(responses: Record<string, unknown> | null): boolean {
  if (!responses) return true

  const catalog = Array.isArray(responses.catalog) ? (responses.catalog as Array<Record<string, unknown>>) : []
  const catalogBlob = catalog
    .map(c => `${String(c.category ?? '')} ${String(c.name ?? '')}`)
    .join(' ')
    .toLowerCase()
  const industry = String(responses.industry ?? '').toLowerCase()
  const isFreight = FREIGHT_HINTS.some(h => catalogBlob.includes(h) || industry.includes(h))
  if (!isFreight) return true

  const faqs = Array.isArray(responses.faqs) ? (responses.faqs as Array<Record<string, unknown>>) : []
  const faqBlob = faqs.map(f => `${String(f.question ?? '')} ${String(f.answer ?? '')}`).join(' ')
  const escalationBlob = String(responses.escalationRules ?? '')
  const textBlob = `${faqBlob} ${escalationBlob}`.toLowerCase()

  const hasRoadside = ROADSIDE_PHRASES.some(p => textBlob.includes(p))
  return !hasRoadside // freight catalogue + roadside language = un-converted template
}

// Fetch the assistant from Vapi and run the validator. Returns two
// flags: `configValid` is true when every critical issue is absent
// (warnings don't block go-live); `promptClean` is true when none of
// the prompt-content critical/warning codes fired. Both default to
// false when the network call can't complete.
async function validateVapiConfig(
  vapiAgentId: string | null,
  plan: string | null,
): Promise<{ configValid: boolean; promptClean: boolean }> {
  const apiKey = process.env.VAPI_API_KEY
  if (!vapiAgentId || !apiKey) return { configValid: false, promptClean: false }

  try {
    const res = await fetch(`https://api.vapi.ai/assistant/${vapiAgentId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return { configValid: false, promptClean: false }
    const assistant = await res.json() as Record<string, unknown>
    const issues = validateAgentConfig(assistant, { plan: plan ?? undefined })

    // configValid = no CRITICAL config issues. We allow warnings
    // (slight stability drift, missing optional tool) through so a
    // client with a 0.39 stability doesn't fail go-live.
    const criticalNonPrompt = issues.filter(i =>
      i.severity === 'critical' &&
      i.code !== 'PLACEHOLDER_IN_PROMPT' &&
      i.code !== 'NO_SYSTEM_PROMPT',
    )
    const configValid = criticalNonPrompt.length === 0

    // promptClean = none of the prompt content codes fired (either
    // severity). The brief is explicit: any placeholder, dollar sign,
    // or ordinal suffix in the prompt is a go-live blocker.
    const promptCodes = new Set(['PLACEHOLDER_IN_PROMPT', 'DOLLAR_SIGN_IN_PROMPT', 'ORDINAL_SUFFIX_IN_PROMPT', 'NO_SYSTEM_PROMPT'])
    const promptClean = !issues.some(i => promptCodes.has(i.code))

    return { configValid, promptClean }
  } catch (e) {
    console.error('[golive-checks] Vapi validation failed', (e as Error).message)
    return { configValid: false, promptClean: false }
  }
}
