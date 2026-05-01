import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function sendAlert(message: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!
  const authToken = process.env.TWILIO_AUTH_TOKEN!

  // SMS to Irfan's mobile
  try {
    const body = new URLSearchParams({
      From: process.env.TWILIO_PHONE_NUMBER || '+61468024020',
      To: process.env.IRFAN_MOBILE || '+61422613708',
      Body: message,
    })
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      }
    )
    if (!res.ok) console.error('[health-monitor] SMS error:', await res.text())
    else console.log('[health-monitor] SMS alert sent')
  } catch (e) {
    console.error('[health-monitor] SMS failed:', e)
  }

  // WhatsApp
  try {
    const waBody = new URLSearchParams({
      From: `whatsapp:+61468024020`,
      To: `whatsapp:${process.env.IRFAN_WHATSAPP || '+61450749863'}`,
      Body: message,
    })
    const waRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: waBody.toString(),
      }
    )
    if (!waRes.ok) console.error('[health-monitor] WhatsApp error:', await waRes.text())
    else console.log('[health-monitor] WhatsApp alert sent')
  } catch (e) {
    console.error('[health-monitor] WhatsApp failed:', e)
  }

  // Telegram backup
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN || '8191514620:AAGmr4DitFXG9Wn0U_26FpDyhKNQyMvmotA'
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: '7809273812', text: message }),
    })
    console.log('[health-monitor] Telegram alert sent')
  } catch (e) {
    console.error('[health-monitor] Telegram failed:', e)
  }
}

async function runChecks(): Promise<{ checks: Record<string, { ok: boolean; statusCode?: number; latencyMs?: number; error?: string }> }> {
  const checks: Record<string, { ok: boolean; statusCode?: number; latencyMs?: number; error?: string }> = {}

  // Check 1: Supabase
  try {
    const t0 = Date.now()
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { error } = await supabase.from('businesses').select('id').limit(1)
    checks.database = { ok: !error, latencyMs: Date.now() - t0, error: error?.message }
  } catch (e: unknown) {
    checks.database = { ok: false, error: String(e) }
  }

  // Check 2: Vapi
  try {
    const t0 = Date.now()
    const res = await fetch('https://api.vapi.ai/assistant?limit=1', {
      headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
      signal: AbortSignal.timeout(6000),
    })
    checks.vapi = { ok: res.ok, statusCode: res.status, latencyMs: Date.now() - t0 }
  } catch (e: unknown) {
    checks.vapi = { ok: false, error: String(e) }
  }

  // Check 3: Stripe
  try {
    const t0 = Date.now()
    const res = await fetch('https://api.stripe.com/v1/customers?limit=1', {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      signal: AbortSignal.timeout(6000),
    })
    checks.stripe = { ok: res.ok, statusCode: res.status, latencyMs: Date.now() - t0 }
  } catch (e: unknown) {
    checks.stripe = { ok: false, error: String(e) }
  }

  return { checks }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const timestamp = new Date().toISOString()

  // First check
  const { checks: firstChecks } = await runChecks()
  const firstFailing = Object.entries(firstChecks).filter(([, v]) => !v.ok).map(([svc]) => svc)

  // All good — silent exit
  if (firstFailing.length === 0) {
    console.log('[health-monitor] All checks passed:', timestamp)
    return NextResponse.json({ alerted: false, status: 'ok', checks: firstChecks, timestamp })
  }

  // Something failed — wait 2 minutes then retry before alerting
  console.log('[health-monitor] First check failed for:', firstFailing, '— retrying in 2 min')
  await sleep(120_000)

  const { checks: retryChecks } = await runChecks()
  const retryFailing = Object.entries(retryChecks).filter(([, v]) => !v.ok).map(([svc]) => svc)

  // Recovered — no alert needed
  if (retryFailing.length === 0) {
    console.log('[health-monitor] Recovered after retry — no alert sent:', timestamp)
    return NextResponse.json({ alerted: false, status: 'recovered', checks: retryChecks, timestamp })
  }

  // Still failing after 2 min — build a detailed diagnosis message
  const brisTime = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', dateStyle: 'short', timeStyle: 'short' })

  const lines: string[] = [`🚨 TalkMate ALERT — ${brisTime} (Brisbane)`]
  lines.push('')

  for (const svc of retryFailing) {
    const detail = retryChecks[svc]
    const statusStr = detail.statusCode ? ` (HTTP ${detail.statusCode})` : ''
    const errStr = detail.error ? ` — ${detail.error.slice(0, 80)}` : ''
    lines.push(`❌ ${svc.toUpperCase()} is DOWN${statusStr}${errStr}`)
  }

  const healthy = Object.entries(retryChecks).filter(([, v]) => v.ok)
  if (healthy.length > 0) {
    lines.push('')
    lines.push('✅ Still healthy: ' + healthy.map(([svc, v]) => `${svc} (${v.latencyMs}ms)`).join(', '))
  }

  lines.push('')
  lines.push('Confirmed down for 2+ minutes. Portal may be affected.')
  lines.push('No action needed from you — Donna is monitoring.')

  const message = lines.join('\n')
  await sendAlert(message)

  return NextResponse.json({ alerted: true, failing: retryFailing, checks: retryChecks, timestamp })
}
