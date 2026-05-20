// Session 18 — Call Intelligence orchestration
//
// scoreCallAsync(): fire-and-forget scoring of a finished call.
// - Reads the call, business, and VIP list from Supabase
// - Calls scoreCall() in /lib/call-intelligence.ts
// - Persists the result to calls.intelligence_*
// - Logs to call_intelligence_log
// - Sends alert SMS to owner/dispatcher per intelligence_alert_config
// - Sends caller-recovery SMS when flags + duration + outcome warrant it
//
// Errors are caught internally and surfaced via console.error so the
// webhook can call this without await. A scoring failure must never
// take down the call save path.

import { createAdminClient } from '@/lib/supabase/server'
import {
  scoreCall,
  INTELLIGENCE_MODEL,
  type CallFlag,
  type CallIntelligenceResult,
  type RelatedSms,
} from '@/lib/call-intelligence'
import {
  sendSMS,
  normaliseAuPhone,
  templateDroppedCallRecovery,
  templateEarlyHangupRecovery,
  templateMissedLeadRecovery,
  type SmsType,
} from '@/lib/sms'
import { notifyAdminOfSmsFailure, notifyAdminOfQualityIssue } from '@/lib/notifications'

interface CallRow {
  id: string
  vapi_call_id: string | null
  business_id: string
  transcript: string | null
  summary: string | null
  duration_seconds: number | null
  caller_number: string | null
  outcome: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
}

interface RelatedSmsRow {
  id: string
  to_phone: string | null
  message: string
  sms_type: string | null
  status: string | null
  sent_at: string | null
  call_id: string | null
  error_message: string | null
}

interface BusinessRow {
  id: string
  name: string | null
  industry: string | null
  business_type: string | null
  escalation_number: string | null
  notifications_config: Record<string, unknown> | null
  intelligence_alert_config: Record<string, unknown> | null
}

interface VipRow {
  phone: string | null
  name: string | null
  vip_bypass: boolean | null
  is_active: boolean | null
}

interface AlertConfig {
  alert_owner: boolean
  alert_dispatcher: boolean
  owner_number: string
  dispatcher_number: string
  alert_on_critical: boolean
  alert_on_warm_lead: boolean
  alert_on_missed_lead: boolean
  alert_on_dropped_call: boolean
  alert_on_vip_failure: boolean
  alert_on_agent_promise: boolean
}

const ALERT_CONFIG_DEFAULTS: AlertConfig = {
  alert_owner: true,
  alert_dispatcher: false,
  owner_number: '',
  dispatcher_number: '',
  alert_on_critical: true,
  alert_on_warm_lead: true,
  alert_on_missed_lead: true,
  alert_on_dropped_call: false,
  alert_on_vip_failure: true,
  alert_on_agent_promise: true,
}

function resolveAlertConfig(
  business: BusinessRow,
): AlertConfig {
  const raw = (business.intelligence_alert_config ?? {}) as Record<string, unknown>
  const fallbackOwner = business.escalation_number ?? ''
  return {
    ...ALERT_CONFIG_DEFAULTS,
    ...Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v !== undefined && v !== null),
    ),
    owner_number: (typeof raw.owner_number === 'string' && raw.owner_number)
      ? raw.owner_number
      : fallbackOwner,
    dispatcher_number: typeof raw.dispatcher_number === 'string'
      ? raw.dispatcher_number
      : '',
  } as AlertConfig
}

function businessPhoneForRecovery(business: BusinessRow): string {
  const cfg = (business.notifications_config ?? {}) as Record<string, unknown>
  const liveTransfer = typeof cfg.live_transfer_number === 'string' ? cfg.live_transfer_number : ''
  if (liveTransfer) return liveTransfer
  return business.escalation_number ?? ''
}

// Map flag types onto the per-business alert_on_* gates. A flag passes
// the gate when its corresponding toggle is on.
function flagPassesGate(flag: CallFlag, cfg: AlertConfig): boolean {
  switch (flag.type) {
    case 'vip_not_transferred': return cfg.alert_on_vip_failure
    case 'agent_promise':        return cfg.alert_on_agent_promise
    case 'warm_lead':             return cfg.alert_on_warm_lead
    case 'missed_lead':           return cfg.alert_on_missed_lead
    case 'no_resolution':         return cfg.alert_on_dropped_call
    // The rest (short_call, caller_frustrated, agent_error) don't have a
    // dedicated toggle — they only contribute when status is critical
    // and alert_on_critical is on.
    default: return false
  }
}

// Was a recovery SMS of any of the given types sent to this number in
// the last 4 hours? Used to suppress duplicate sends.
async function recentRecoverySent(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  toPhone: string,
  types: SmsType[],
  hours = 4,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('sms_log')
    .select('id')
    .eq('client_id', clientId)
    .eq('to_phone', toPhone)
    .in('sms_type', types)
    .gte('sent_at', cutoff)
    .limit(1)
  return Array.isArray(data) && data.length > 0
}

async function logAttempt(
  supabase: ReturnType<typeof createAdminClient>,
  callId: string,
  clientId: string,
  status: 'success' | 'failed' | 'skipped',
  errorMessage: string | null,
  result: CallIntelligenceResult | null,
  attempt: number,
): Promise<void> {
  await supabase.from('call_intelligence_log').insert({
    call_id: callId,
    client_id: clientId,
    attempt,
    model: INTELLIGENCE_MODEL,
    prompt_tokens: result?.prompt_tokens ?? null,
    completion_tokens: result?.completion_tokens ?? null,
    status,
    error_message: errorMessage,
  })
}

// Fire-and-forget entry point. Always resolves — never throws.
export async function scoreCallAsync(
  vapiCallId: string,
  businessId: string,
  attempt = 1,
): Promise<void> {
  const supabase = createAdminClient()

  try {
    // 1. Load the call + business + VIPs in parallel
    const [callRes, bizRes, vipRes] = await Promise.all([
      supabase
        .from('calls')
        .select('id, vapi_call_id, business_id, transcript, summary, duration_seconds, caller_number, outcome, started_at, ended_at, created_at')
        .eq('vapi_call_id', vapiCallId)
        .maybeSingle(),
      supabase
        .from('businesses')
        .select('id, name, industry, business_type, escalation_number, notifications_config, intelligence_alert_config')
        .eq('id', businessId)
        .maybeSingle(),
      supabase
        .from('vip_callers')
        .select('phone, name, vip_bypass, is_active')
        .eq('client_id', businessId)
        .eq('is_active', true),
    ])

    const call = callRes.data as CallRow | null
    const business = bizRes.data as BusinessRow | null
    const vips = (vipRes.data ?? []) as VipRow[]

    if (!call) {
      console.error('[score-call-async] call not found', { vapiCallId })
      return
    }
    if (!business) {
      console.error('[score-call-async] business not found', { businessId })
      return
    }

    // 2. Skip if no transcript. Mark pending so the retry cron can pick
    //    it up if Vapi delivers the transcript late.
    const transcript = (call.transcript ?? '').trim()
    if (!transcript) {
      await supabase
        .from('calls')
        .update({ intelligence_status: 'pending' })
        .eq('vapi_call_id', vapiCallId)
      await logAttempt(supabase, vapiCallId, businessId, 'skipped', 'No transcript', null, attempt)
      return
    }

    // 2b. Session 19 — pull SMS sent in the 10-minute window after the
    //     call ended (or after created_at if ended_at isn't set). We pass
    //     these into the scorer for verification AND backfill call_id on
    //     any unlinked rows so the client SMS Activity view shows them
    //     alongside the call.
    const callEndIso = call.ended_at ?? call.created_at
    const windowEndIso = new Date(Date.parse(callEndIso) + 10 * 60 * 1000).toISOString()
    const { data: relatedSmsData } = await supabase
      .from('sms_log')
      .select('id, to_phone, message, sms_type, status, sent_at, call_id, error_message')
      .eq('client_id', businessId)
      .gte('sent_at', callEndIso)
      .lte('sent_at', windowEndIso)
      .order('sent_at', { ascending: true })
    const relatedSms = (relatedSmsData ?? []) as RelatedSmsRow[]

    // Backfill call_id on any sms_log rows that don't have one yet.
    const unlinkedIds = relatedSms.filter(s => !s.call_id).map(s => s.id)
    if (unlinkedIds.length > 0) {
      await supabase
        .from('sms_log')
        .update({ call_id: call.id })
        .in('id', unlinkedIds)
    }

    // 3. Score
    let result: CallIntelligenceResult
    try {
      result = await scoreCall({
        transcript,
        summary: call.summary,
        duration_seconds: call.duration_seconds,
        caller_phone: call.caller_number,
        outcome: call.outcome,
        business_name: business.name ?? 'this business',
        industry: business.industry ?? business.business_type ?? null,
        vip_callers: vips
          .filter(v => !!v.phone)
          .map(v => ({
            phone: v.phone as string,
            name: v.name ?? '',
            vip_bypass: !!v.vip_bypass,
          })),
        related_sms: relatedSms.map<RelatedSms>(s => ({
          sms_type: s.sms_type,
          to_phone: s.to_phone,
          message: s.message,
          status: s.status,
          sent_at: s.sent_at,
        })),
      })
    } catch (e) {
      const msg = (e as Error).message ?? 'scoring failed'
      console.error('[score-call-async] scoring failed', { vapiCallId, error: msg })
      await supabase
        .from('calls')
        .update({
          intelligence_status: 'error',
          alert_reason: msg.slice(0, 240),
          sms_verification_status: 'error',
          sms_verification_note: msg.slice(0, 240),
        })
        .eq('vapi_call_id', vapiCallId)
      await logAttempt(supabase, vapiCallId, businessId, 'failed', msg.slice(0, 400), null, attempt)
      return
    }

    // 3b. Failed-delivery alert routes to Irfan only via Telegram. Never
    //     surfaces to the client.
    const failedSms = relatedSms.filter(s => s.status === 'failed' || s.status === 'rejected')
    if (failedSms.length > 0) {
      notifyAdminOfSmsFailure({
        businessName: business.name,
        vapiCallId,
        failedSms: failedSms.map(s => ({
          to_phone: s.to_phone,
          message: s.message,
          sms_type: s.sms_type,
          error_message: s.error_message,
        })),
      }).catch(err => console.error('[score-call-async] admin failure alert error', (err as Error).message))
    }

    // 4. Decide alert routing (before persisting so we can stamp
    //    owner_alerted on the same update).
    const alertCfg = resolveAlertConfig(business)
    const { shouldAlert, recipients, alertReason } = decideAlertRouting(result, alertCfg)
    const alertText = result.alert_message
      ?? buildFallbackAlertMessage(result, business.name ?? 'TalkMate', call.caller_number)

    let ownerAlerted = false
    if (shouldAlert && alertText && recipients.length > 0) {
      for (const to of recipients) {
        const res = await sendSMS({
          to,
          message: alertText,
          clientId: businessId,
          smsType: 'call_intelligence_alert',
        })
        if (res.success) ownerAlerted = true
        else console.warn('[score-call-async] alert SMS failed', { to, reason: res.reason, error: res.error })
      }
    }

    // 5. Persist intelligence to calls
    await supabase
      .from('calls')
      .update({
        intelligence_score: result.score,
        intelligence_status: result.status,
        intelligence_summary: result.summary,
        intelligence_flags: result.flags,
        intelligence_actions: result.actions,
        intelligence_scored_at: new Date().toISOString(),
        owner_alerted: ownerAlerted,
        alert_reason: ownerAlerted ? alertReason : null,
        // Session 19 — SMS verification result. Always written so admin
        // surfaces never see stale data.
        sms_verification_status: result.sms_verification.status,
        sms_verification_note: result.sms_verification.note,
      })
      .eq('vapi_call_id', vapiCallId)

    await logAttempt(supabase, vapiCallId, businessId, 'success', null, result, attempt)

    // 6. Caller recovery SMS — runs after scoring/alerting so the call
    //    row already reflects the intelligence outcome.
    await maybeSendRecoverySms(supabase, call, business, result)

    // 7. Admin quality alert (Session 22B). Operator gets a Telegram
    //    ping for genuinely worrying calls. Trigger:
    //      duration >= 10s
    //      AND (score < 5 OR any critical flag OR sms verification mismatch)
    //      AND flags aren't only the "too noisy" ones (short_call /
    //          no_resolution by themselves don't warrant a ping).
    //
    //    Fire-and-forget — notifyAdminOfQualityIssue already swallows
    //    its own errors, so this can't break the scoring flow.
    const CRITICAL_FLAG_TYPES = new Set([
      'agent_error', 'sms_mismatch', 'missed_lead', 'dropped_call', 'wrong_info',
    ])
    const NOISY_FLAG_TYPES = new Set(['short_call', 'no_resolution'])

    const flagTypes = result.flags.map(f => f.type)
    const hasCriticalFlag = flagTypes.some(t => CRITICAL_FLAG_TYPES.has(t))
    const isSmsMismatch = result.sms_verification.status === 'mismatch'
    const onlyNoisyFlags = flagTypes.length > 0 && flagTypes.every(t => NOISY_FLAG_TYPES.has(t))
    const duration = call.duration_seconds ?? 0

    const shouldAdminAlert =
      duration >= 10
      && (result.score < 5 || hasCriticalFlag || isSmsMismatch)
      && !onlyNoisyFlags

    if (shouldAdminAlert) {
      notifyAdminOfQualityIssue({
        businessName: business.name ?? 'TalkMate client',
        businessId: business.id,
        callerPhone: call.caller_number ?? 'Unknown',
        score: result.score,
        flags: flagTypes,
        summary: result.summary,
        vapiCallId,
        callId: call.id,
      }).catch(err => console.error('[score-call-async] admin quality alert error', (err as Error).message))
    }
  } catch (e) {
    // Never let an unexpected throw escape — webhook caller does not
    // await us and there's no upstream to handle it.
    console.error('[score-call-async] unexpected error', {
      vapiCallId, error: (e as Error).message,
    })
  }
}

interface AlertDecision {
  shouldAlert: boolean
  recipients: string[]
  alertReason: string
}

function decideAlertRouting(
  result: CallIntelligenceResult,
  cfg: AlertConfig,
): AlertDecision {
  if (!result.should_alert_owner) {
    return { shouldAlert: false, recipients: [], alertReason: '' }
  }

  // Identify which gates pass for this scoring result.
  const reasons: string[] = []
  if (result.status === 'critical' && cfg.alert_on_critical) reasons.push('critical')
  for (const f of result.flags) {
    if (flagPassesGate(f, cfg)) reasons.push(f.type)
  }
  if (reasons.length === 0) {
    return { shouldAlert: false, recipients: [], alertReason: '' }
  }

  const recipients: string[] = []
  if (cfg.alert_owner) {
    const owner = normaliseAuPhone(cfg.owner_number)
    if (owner) recipients.push(owner)
  }
  if (cfg.alert_dispatcher) {
    const dispatcher = normaliseAuPhone(cfg.dispatcher_number)
    if (dispatcher) recipients.push(dispatcher)
  }

  if (recipients.length === 0) {
    return { shouldAlert: false, recipients: [], alertReason: '' }
  }

  return {
    shouldAlert: true,
    recipients,
    alertReason: Array.from(new Set(reasons)).join(','),
  }
}

function buildFallbackAlertMessage(
  result: CallIntelligenceResult,
  businessName: string,
  callerPhone: string | null,
): string {
  const flagLabel = result.flags[0]?.type ?? 'call needs review'
  const caller = callerPhone ? ` Caller: ${callerPhone}.` : ''
  const base = `TalkMate (${businessName}): ${flagLabel.replace(/_/g, ' ')}.${caller}`
  return base.slice(0, 160)
}

async function maybeSendRecoverySms(
  supabase: ReturnType<typeof createAdminClient>,
  call: CallRow,
  business: BusinessRow,
  result: CallIntelligenceResult,
): Promise<void> {
  const callerRaw = call.caller_number
  if (!callerRaw) return
  const caller = normaliseAuPhone(callerRaw)
  if (!caller) return

  // Never recover if the call was actually resolved or ended in a booking.
  const outcome = (call.outcome ?? '').toLowerCase()
  if (outcome === 'resolved' || outcome === 'booking_made' || outcome === 'appointment booked') return

  const duration = call.duration_seconds ?? 0
  const flagTypes = new Set(result.flags.map(f => f.type))

  const businessName = business.name ?? 'us'
  const businessPhone = businessPhoneForRecovery(business)
  const ctx = { business_name: businessName, business_phone: businessPhone }

  // Condition 3: missed lead with > 45s of conversation
  if (flagTypes.has('missed_lead') && duration > 45) {
    if (await recentRecoverySent(supabase, business.id, caller, ['missed_lead_recovery', 'early_hangup_recovery', 'dropped_call_recovery'])) return
    await sendSMS({
      to: caller,
      message: templateMissedLeadRecovery(ctx),
      clientId: business.id,
      smsType: 'missed_lead_recovery',
    })
    return
  }

  // Condition 2: early hang-up (10-45s) with warm/missed-lead intent
  if (duration >= 10 && duration <= 45 && (flagTypes.has('warm_lead') || flagTypes.has('missed_lead'))) {
    if (await recentRecoverySent(supabase, business.id, caller, ['early_hangup_recovery', 'missed_lead_recovery', 'dropped_call_recovery'])) return
    await sendSMS({
      to: caller,
      message: templateEarlyHangupRecovery(ctx),
      clientId: business.id,
      smsType: 'early_hangup_recovery',
    })
    return
  }

  // Condition 1: dropped call — no resolution, > 15s, ended unexpectedly
  const droppedReasonable = duration > 15
    && outcome !== 'completed'
    && outcome !== 'transferred'
  if (flagTypes.has('no_resolution') && droppedReasonable) {
    if (await recentRecoverySent(supabase, business.id, caller, ['dropped_call_recovery', 'early_hangup_recovery', 'missed_lead_recovery'])) return
    await sendSMS({
      to: caller,
      message: templateDroppedCallRecovery(ctx),
      clientId: business.id,
      smsType: 'dropped_call_recovery',
    })
  }
}
