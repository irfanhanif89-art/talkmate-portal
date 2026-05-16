import { createAdminClient } from '@/lib/supabase/server'

// Session 15 — direct Twilio SMS service. Replaces the Make.com Booking
// SMS scenario for everything booking-related (confirmations, reminders,
// cancellations, waitlist, VIP missed calls).
//
// Single rule: every send goes through `sendSMS` so we get plan-limit
// enforcement, the `sms_log` audit row, and the `sms_used_this_month`
// counter increment in one place.

export type SmsType =
  | 'booking_confirmation'
  | 'booking_reminder_24h'
  | 'booking_reminder_2h'
  | 'booking_cancellation'
  | 'waitlist_offer'
  | 'waitlist_claimed'
  | 'waitlist_expired'
  | 'callback_reminder'
  | 'vip_missed_call'
  | 'other'

export interface SendSMSOptions {
  to: string
  message: string
  clientId: string
  smsType: SmsType
  bookingId?: string
  waitlistId?: string
}

export interface SendSMSResult {
  success: boolean
  sid?: string
  error?: string
  reason?: 'plan_starter' | 'plan_quota' | 'twilio_error' | 'config_missing' | 'invalid_phone'
}

const PLAN_LIMITS: Record<string, number> = {
  starter: 0,
  growth: 200,
  pro: 500,
  professional: 500, // legacy alias
}

// Normalise to +61 E.164. Accepts:
//   0412345678        -> +61412345678
//   +61412345678      -> +61412345678
//   0061412345678     -> +61412345678
//   61412345678       -> +61412345678 (assumed)
//   04 1234 5678      -> +61412345678
// Returns null when the input doesn't look like an AU mobile.
export function normaliseAuPhone(input: string | null | undefined): string | null {
  if (!input) return null
  const digits = String(input).replace(/[^0-9+]/g, '')
  if (!digits) return null
  if (digits.startsWith('+61')) return digits.length >= 11 ? digits : null
  if (digits.startsWith('0061')) return `+${digits.slice(2)}`
  if (digits.startsWith('61') && digits.length >= 10) return `+${digits}`
  if (digits.startsWith('0') && digits.length >= 10) return `+61${digits.slice(1)}`
  if (/^[1-9]\d{8,9}$/.test(digits)) return `+61${digits}`
  return null
}

// Monthly reset is opportunistic: if sms_reset_at is older than the start
// of the current month we zero the counter before the limit check. This
// is a tiny extra read per send but avoids needing a dedicated cron.
async function ensureMonthlyReset(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  resetAt: string | null,
): Promise<void> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const last = resetAt ? new Date(resetAt) : new Date(0)
  if (last.getTime() < startOfMonth.getTime()) {
    await supabase
      .from('businesses')
      .update({ sms_used_this_month: 0, sms_reset_at: startOfMonth.toISOString() })
      .eq('id', clientId)
  }
}

export async function sendSMS(opts: SendSMSOptions): Promise<SendSMSResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER
  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: 'Twilio not configured', reason: 'config_missing' }
  }

  const to = normaliseAuPhone(opts.to)
  if (!to) {
    return { success: false, error: 'Invalid Australian phone number', reason: 'invalid_phone' }
  }

  const supabase = createAdminClient()

  // ---- plan + quota check ------------------------------------------
  const { data: biz } = await supabase
    .from('businesses')
    .select('plan, sms_used_this_month, sms_reset_at, name')
    .eq('id', opts.clientId)
    .maybeSingle()
  const plan = (biz?.plan as string | null) ?? 'starter'
  const limit = PLAN_LIMITS[plan] ?? 0
  if (limit === 0) {
    await supabase.from('sms_log').insert({
      client_id: opts.clientId, to_phone: to, message: opts.message,
      status: 'rejected', sms_type: opts.smsType,
      booking_id: opts.bookingId ?? null, waitlist_id: opts.waitlistId ?? null,
      error_message: 'SMS not available on this plan',
    })
    return { success: false, error: 'SMS not available on Starter plan', reason: 'plan_starter' }
  }

  await ensureMonthlyReset(supabase, opts.clientId, (biz?.sms_reset_at as string | null) ?? null)

  // Re-read counter post-reset so we don't double-count
  const { data: bizPost } = await supabase
    .from('businesses')
    .select('sms_used_this_month')
    .eq('id', opts.clientId)
    .maybeSingle()
  const used = bizPost?.sms_used_this_month ?? 0
  if (used >= limit) {
    await supabase.from('sms_log').insert({
      client_id: opts.clientId, to_phone: to, message: opts.message,
      status: 'rejected', sms_type: opts.smsType,
      booking_id: opts.bookingId ?? null, waitlist_id: opts.waitlistId ?? null,
      error_message: `Monthly SMS limit reached (${limit})`,
    })
    return { success: false, error: `Monthly SMS limit reached (${limit})`, reason: 'plan_quota' }
  }

  // ---- send via Twilio REST ----------------------------------------
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const body = new URLSearchParams({ To: to, From: fromNumber, Body: opts.message })
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  let sid: string | undefined
  let twilioError: string | undefined
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })
    const data = await res.json().catch(() => ({} as Record<string, unknown>))
    if (!res.ok) {
      twilioError = typeof data.message === 'string'
        ? data.message
        : `Twilio HTTP ${res.status}`
    } else {
      sid = (data as { sid?: string }).sid
    }
  } catch (e) {
    twilioError = (e as Error).message
  }

  if (twilioError) {
    await supabase.from('sms_log').insert({
      client_id: opts.clientId, to_phone: to, message: opts.message,
      status: 'failed', sms_type: opts.smsType,
      booking_id: opts.bookingId ?? null, waitlist_id: opts.waitlistId ?? null,
      error_message: twilioError,
    })
    return { success: false, error: twilioError, reason: 'twilio_error' }
  }

  await supabase.from('sms_log').insert({
    client_id: opts.clientId, to_phone: to, message: opts.message,
    twilio_sid: sid ?? null, status: 'sent', sms_type: opts.smsType,
    booking_id: opts.bookingId ?? null, waitlist_id: opts.waitlistId ?? null,
  })

  // Increment counter. We read-then-update rather than RPC to keep the
  // migration footprint small; the race here is acceptable for a single-
  // owner SaaS where quotas are loose bounds, not hard contracts.
  await supabase
    .from('businesses')
    .update({ sms_used_this_month: used + 1 })
    .eq('id', opts.clientId)

  return { success: true, sid }
}

// ────────────────────────── templates ────────────────────────────────

export interface SmsTemplateContext {
  caller_name?: string | null
  business_name?: string
  business_phone?: string
  truck_type?: string | null
  date?: string
  time?: string
  pickup_address?: string | null
  dropoff_address?: string | null
  claim_window?: number
  vip_name?: string
  vip_phone?: string
  summary?: string
}

function fmtTruck(t: string | null | undefined): string {
  if (!t) return 'job'
  if (t === 'loaded_tilt_tray') return 'loaded tilt tray'
  if (t === 'empty_tilt_tray') return 'empty tilt tray'
  if (t === 'sideloader_40ft') return 'sideloader'
  return t
}

function safe(name: string | null | undefined): string {
  return (name ?? '').trim() || 'there'
}

export function templateBookingConfirmation(ctx: SmsTemplateContext): string {
  const name = safe(ctx.caller_name)
  const truck = fmtTruck(ctx.truck_type)
  const route = ctx.pickup_address && ctx.dropoff_address
    ? `${ctx.pickup_address} to ${ctx.dropoff_address}. `
    : ctx.pickup_address ? `${ctx.pickup_address}. ` : ''
  return `Hi ${name}, your ${truck} job with ${ctx.business_name ?? 'us'} is confirmed for ${ctx.date} at ${ctx.time}. ${route}Questions? Call ${ctx.business_phone ?? ''}.`.trim()
}

export function templateReminder24h(ctx: SmsTemplateContext): string {
  const route = ctx.pickup_address && ctx.dropoff_address
    ? `${ctx.pickup_address} to ${ctx.dropoff_address}. `
    : ctx.pickup_address ? `${ctx.pickup_address}. ` : ''
  return `Reminder: Your job with ${ctx.business_name ?? 'us'} is tomorrow at ${ctx.time}. ${route}Call ${ctx.business_phone ?? ''} if you need to reschedule.`.trim()
}

export function templateReminder2h(ctx: SmsTemplateContext): string {
  return `Your ${ctx.business_name ?? ''} job starts in 2 hours (${ctx.time}). Driver will meet you at ${ctx.pickup_address ?? 'the pickup address'}. Call ${ctx.business_phone ?? ''} if needed.`.trim()
}

export function templateCancellation(ctx: SmsTemplateContext): string {
  return `Your job with ${ctx.business_name ?? 'us'} on ${ctx.date} at ${ctx.time} has been cancelled. Call ${ctx.business_phone ?? ''} if this is a mistake.`.trim()
}

export function templateWaitlistOffer(ctx: SmsTemplateContext): string {
  const name = safe(ctx.caller_name)
  return `Hi ${name}, a slot has opened with ${ctx.business_name ?? 'us'} on ${ctx.date} at ${ctx.time}. Reply YES to claim it. This offer expires in ${ctx.claim_window ?? 30} minutes.`.trim()
}

export function templateWaitlistClaimed(ctx: SmsTemplateContext): string {
  const route = ctx.pickup_address && ctx.dropoff_address
    ? `${ctx.pickup_address} to ${ctx.dropoff_address}. `
    : ''
  return `Your slot is confirmed with ${ctx.business_name ?? 'us'} on ${ctx.date} at ${ctx.time}. ${route}See you then.`.trim()
}

export function templateWaitlistExpired(ctx: SmsTemplateContext): string {
  const name = safe(ctx.caller_name)
  return `Hi ${name}, the slot with ${ctx.business_name ?? 'us'} was taken by another customer. We will notify you when another slot opens.`.trim()
}

export function templateVipMissedCall(ctx: SmsTemplateContext): string {
  const summary = (ctx.summary ?? 'No message left.').trim()
  return `VIP call missed: ${ctx.vip_name ?? 'Unknown'} (${ctx.vip_phone ?? ''}) called twice and could not reach you. Message: ${summary}`.trim()
}
