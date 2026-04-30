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

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const timestamp = new Date().toISOString()
  const checks: Record<string, boolean> = {}

  // Check 1: Supabase — direct DB query (no self-call)
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { error } = await supabase.from('businesses').select('id').limit(1)
    checks.database = !error
  } catch {
    checks.database = false
  }

  // Check 2: Vapi — external API ping
  try {
    const res = await fetch('https://api.vapi.ai/assistant?limit=1', {
      headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    })
    checks.vapi = res.ok
  } catch {
    checks.vapi = false
  }

  // Check 3: Stripe — external API ping
  try {
    const res = await fetch('https://api.stripe.com/v1/customers?limit=1', {
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      },
      signal: AbortSignal.timeout(5000),
    })
    checks.stripe = res.ok
  } catch {
    checks.stripe = false
  }

  const failing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([svc]) => svc)

  if (failing.length > 0) {
    const message = `TalkMate ALERT: ${failing.join(', ')} is down. Time: ${timestamp}. Check app.talkmate.com.au immediately.`
    await sendAlert(message)
    return NextResponse.json({ alerted: true, failing, timestamp })
  }

  // All good — silent exit
  console.log('[health-monitor] All checks passed:', timestamp)
  return NextResponse.json({ alerted: false, status: 'ok', checks, timestamp })
}
