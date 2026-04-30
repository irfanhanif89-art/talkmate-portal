import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Sends alert via Twilio SMS (falls back to Telegram bot if SMS fails)
async function sendAlert(message: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!
  const authToken = process.env.TWILIO_AUTH_TOKEN!

  // SMS to Irfan's mobile
  const body = new URLSearchParams({
    From: process.env.TWILIO_PHONE_NUMBER || '+61468024020',
    To: process.env.IRFAN_MOBILE || '+61468024020', // Set IRFAN_MOBILE in Vercel env
    Body: message,
  })

  try {
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
    if (!res.ok) {
      const err = await res.text()
      console.error('[health-monitor] Twilio SMS error:', err)
    } else {
      console.log('[health-monitor] SMS alert sent')
    }
  } catch (e) {
    console.error('[health-monitor] Failed to send SMS:', e)
  }

  // Also notify via Telegram (OpenClaw bot) as a reliable backup
  try {
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '8191514620:AAGmr4DitFXG9Wn0U_26FpDyhKNQyMvmotA'
    const chatId = '7809273812'
    await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    })
    console.log('[health-monitor] Telegram alert sent')
  } catch (e) {
    console.error('[health-monitor] Failed to send Telegram alert:', e)
  }
}

export async function GET(request: Request) {
  // Verify this is called by Vercel Cron
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au'

  let health: { status: string; checks: Record<string, boolean>; timestamp: string }
  try {
    const res = await fetch(`${appUrl}/api/health`, {
      signal: AbortSignal.timeout(8000),
    })
    health = await res.json()
  } catch {
    const timestamp = new Date().toISOString()
    await sendAlert(
      `TalkMate ALERT: Health endpoint unreachable (full outage). Time: ${timestamp}. Check app.talkmate.com.au immediately.`
    )
    return NextResponse.json({ alerted: true, reason: 'health endpoint unreachable' })
  }

  if (health.status !== 'ok') {
    const failing = Object.entries(health.checks)
      .filter(([, ok]) => !ok)
      .map(([svc]) => svc)
      .join(', ')

    const message = `TalkMate ALERT: ${failing} is down. Time: ${health.timestamp}. Check app.talkmate.com.au immediately.`
    await sendAlert(message)
    return NextResponse.json({ alerted: true, failing, timestamp: health.timestamp })
  }

  // All good — silent exit
  return NextResponse.json({ alerted: false, status: 'ok', timestamp: health.timestamp })
}
