import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { computeAutoChecks } from '@/lib/golive-checks'
import { sendAdminTelegram } from '@/lib/notifications'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
// TELEGRAM_ADMIN_CHAT_ID must be set in Vercel env vars. No source fallback.
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID

// Session 28 (H8): required manual checks before an agent can be
// approved without an override. Pulled from MANUAL_CHECK_KEYS in
// /lib/golive-checks.ts — keep this list in sync with that file.
const REQUIRED_MANUAL_CHECKS = [
  'manual_vapi_functions_registered',
  'manual_test_call_made',
  'manual_sms_delivered_to_owner',
] as const

export async function POST(req: NextRequest) {
  // Session 28 (H8): switch from ADMIN_SECRET_KEY header to the
  // standard admin gate used by every other /api/admin/* route.
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (!RESEND_API_KEY || !TELEGRAM_BOT_TOKEN) {
    console.error('[approve-agent] Missing RESEND_API_KEY or TELEGRAM_BOT_TOKEN env vars')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const { businessId } = await req.json()
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 })

  const supabase = createAdminClient()

  const { data: business } = await supabase
    .from('businesses')
    .select('*, owner_user_id')
    .eq('id', businessId)
    .single()

  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  if (!business.vapi_agent_id) return NextResponse.json({ error: 'No agent on this business' }, { status: 400 })

  // Session 28 (H8) — gate on the go-live checklist.
  // Run automated checks server-side. Then read the manual checklist
  // row and require the three operational items (functions
  // registered, test call made, owner SMS verified) before approval.
  // ?override=true short-circuits the gate but fires a Telegram alert
  // so we know an emergency approval went out.
  const { result: autoChecks } = await computeAutoChecks(supabase, businessId)
  const { data: checklist } = await supabase
    .from('client_golive_checklist')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle()

  const failingChecks: string[] = []
  for (const [key, value] of Object.entries(autoChecks)) {
    if (value === false) failingChecks.push(key)
  }
  for (const check of REQUIRED_MANUAL_CHECKS) {
    if (!checklist?.[check]) failingChecks.push(check)
  }

  const override = req.nextUrl.searchParams.get('override') === 'true'
  if (failingChecks.length > 0 && !override) {
    return NextResponse.json({
      error: 'Go-live checklist incomplete',
      failing_checks: failingChecks,
      hint: 'Add ?override=true to bypass (Telegram alert will fire)',
    }, { status: 400 })
  }

  if (failingChecks.length > 0 && override) {
    await sendAdminTelegram(
      `⚠️ Go-live override used for ${business.name}. Failing checks: ${failingChecks.join(', ')}`,
    ).catch(() => {})
  }

  const { data: owner } = await supabase
    .from('users')
    .select('email')
    .eq('id', business.owner_user_id)
    .single()

  // Provision Twilio AU number
  let twilioNumber = null
  try {
    const twilioSid = process.env.TWILIO_ACCOUNT_SID
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN
    if (!twilioSid || !twilioAuth) throw new Error('Twilio not configured')

    const twilioBase = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}`
    const twilioHeaders = {
      'Authorization': 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    }

    // Search for available AU mobile
    const searchRes = await fetch(
      `${twilioBase}/AvailablePhoneNumbers/AU/Mobile.json?VoiceEnabled=true&PageSize=1`,
      { headers: twilioHeaders }
    )
    const searchData = await searchRes.json()
    const availableNumber = searchData?.available_phone_numbers?.[0]?.phone_number

    if (availableNumber) {
      const buyRes = await fetch(`${twilioBase}/IncomingPhoneNumbers.json`, {
        method: 'POST',
        headers: twilioHeaders,
        body: new URLSearchParams({ PhoneNumber: availableNumber }).toString(),
      })
      const buyData = await buyRes.json()
      if (buyData.phone_number) {
        twilioNumber = buyData.phone_number

        // Register in Vapi and link to agent
        await fetch('https://api.vapi.ai/phone-number', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.VAPI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'twilio',
            number: twilioNumber,
            twilioAccountSid: twilioSid,
            twilioAuthToken: twilioAuth,
            assistantId: business.vapi_agent_id,
            name: `${business.name} — TalkMate Line`,
          }),
        })
      }
    }
  } catch (e) {
    console.error('Twilio provision error:', e)
  }

  // Update business to live
  await supabase.from('businesses').update({
    agent_status: 'live',
    agent_approved_at: new Date().toISOString(),
    ...(twilioNumber ? { phone_number: twilioNumber } : {}),
  }).eq('id', businessId)

  // Send welcome email to client with their number.
  // Session 30 — only fire on the clean (non-override) path. If we
  // got here via ?override=true the checklist had failing items and
  // we shouldn't tell the client they're live until those are sorted.
  if (owner?.email && failingChecks.length === 0) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'TalkMate <hello@talkmate.com.au>',
        to: owner.email,
        subject: `You're live — ${business.name}'s AI receptionist is ready`,
        html: `
          <div style="font-family: 'Outfit', sans-serif; max-width: 560px; margin: 0 auto; background: #061322; color: white; padding: 40px; border-radius: 16px;">
            <div style="margin-bottom: 28px;"><span style="font-size: 28px; font-weight: 800;">Talk</span><span style="font-size: 18px; font-weight: 300; color: #4A9FE8; letter-spacing: 4px;">Mate</span></div>
            <h1 style="font-size: 28px; font-weight: 800; margin-bottom: 12px;">You're live! 🎉</h1>
            <p style="font-size: 16px; color: rgba(255,255,255,0.7); line-height: 1.7; margin-bottom: 24px;">
              Your AI receptionist for <strong style="color: white;">${business.name}</strong> has been reviewed and is ready to go.
            </p>
            ${twilioNumber ? `
            <div style="background: rgba(232,98,42,0.15); border: 1px solid rgba(232,98,42,0.4); border-radius: 12px; padding: 24px; margin-bottom: 28px;">
              <p style="font-size: 12px; color: #E8622A; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 6px;">Your TalkMate Number</p>
              <p style="font-size: 32px; font-weight: 800; color: white; letter-spacing: 2px; margin: 0;">${twilioNumber}</p>
            </div>
            <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; margin-bottom: 28px;">
              <p style="font-size: 14px; font-weight: 700; color: white; margin-bottom: 12px;">One step to go live:</p>
              <p style="font-size: 14px; color: rgba(255,255,255,0.65); line-height: 1.8; margin: 0;">
                Forward your existing business phone number to <strong style="color: white;">${twilioNumber}</strong>.<br/>
                On most AU phones: dial <strong style="color: #4A9FE8;">**21*${twilioNumber}#</strong> to activate forwarding.<br/>
                Or contact your telco (Telstra/Optus/Vodafone) to set it up.
              </p>
            </div>` : ''}
            <a href="https://app.talkmate.com.au/dashboard" style="display: inline-block; background: #E8622A; color: white; font-size: 16px; font-weight: 700; padding: 16px 32px; border-radius: 10px; text-decoration: none;">Go to Dashboard →</a>
            <p style="font-size: 13px; color: rgba(255,255,255,0.35); margin-top: 28px;">Questions? Reply to this email — we're a real team on the Gold Coast.</p>
          </div>
        `,
      }),
    }).catch(console.error)
  }

  // Confirm to Irfan on Telegram
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: `✅ *${business.name}* approved and live!\n\nPhone number: ${twilioNumber || 'manual provisioning needed'}\nWelcome email sent to client.`,
      parse_mode: 'Markdown',
    }),
  }).catch(console.error)

  return NextResponse.json({ success: true, twilioNumber })
}
