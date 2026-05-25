import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { provisionAgent } from '@/lib/provisioning/approveAgent'
import { sendEmail } from '@/lib/resend'
import { sendAdminTelegram } from '@/lib/notifications'
import { createAdminClient } from '@/lib/supabase/server'

// Session 41 — thin wrapper. The provisioning core (Twilio + Vapi +
// checklist gate) lives in /lib/provisioning/approveAgent.ts so the new
// admin onboarding wizard Go Live route can re-use it. This wrapper
// preserves the existing external request/response shape:
//   POST { businessId } ?override=true
//   200 { success: true, twilioNumber: string|null }
//   4xx/5xx { error: string, failing_checks?: string[] }

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { businessId } = await req.json()
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 })

  const override = req.nextUrl.searchParams.get('override') === 'true'
  const result = await provisionAgent(businessId, { override })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, failing_checks: result.failing_checks },
      { status: result.status },
    )
  }

  const admin = createAdminClient()
  const { data: business } = await admin
    .from('businesses')
    .select('name, owner_user_id')
    .eq('id', businessId)
    .maybeSingle()

  let ownerEmail: string | null = null
  if (business?.owner_user_id) {
    const { data: owner } = await admin
      .from('users')
      .select('email')
      .eq('id', business.owner_user_id)
      .maybeSingle()
    ownerEmail = owner?.email ?? null
  }

  // Original "You're live" welcome email preserved here (NOT in the lib).
  // Only fires on the clean path; ?override=true skips it because we
  // don't want to tell the client they're live if checks were failing.
  if (ownerEmail && result.phone_number && !override) {
    await sendEmail({
      to: ownerEmail,
      from: 'TalkMate <hello@talkmate.com.au>',
      subject: `You're live: ${business?.name}'s AI receptionist is ready`,
      html: `
        <div style="font-family: 'Outfit', sans-serif; max-width: 560px; margin: 0 auto; background: #061322; color: white; padding: 40px; border-radius: 16px;">
          <div style="margin-bottom: 28px;"><span style="font-size: 28px; font-weight: 800;">Talk</span><span style="font-size: 18px; font-weight: 300; color: #4A9FE8; letter-spacing: 4px;">Mate</span></div>
          <h1 style="font-size: 28px; font-weight: 800; margin-bottom: 12px;">You're live</h1>
          <p style="font-size: 16px; color: rgba(255,255,255,0.7); line-height: 1.7; margin-bottom: 24px;">
            Your AI receptionist for <strong style="color: white;">${business?.name}</strong> has been reviewed and is ready to go.
          </p>
          <div style="background: rgba(232,98,42,0.15); border: 1px solid rgba(232,98,42,0.4); border-radius: 12px; padding: 24px; margin-bottom: 28px;">
            <p style="font-size: 12px; color: #E8622A; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 6px;">Your TalkMate Number</p>
            <p style="font-size: 32px; font-weight: 800; color: white; letter-spacing: 2px; margin: 0;">${result.phone_number}</p>
          </div>
          <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; margin-bottom: 28px;">
            <p style="font-size: 14px; font-weight: 700; color: white; margin-bottom: 12px;">One step to go live:</p>
            <p style="font-size: 14px; color: rgba(255,255,255,0.65); line-height: 1.8; margin: 0;">
              Forward your existing business phone number to <strong style="color: white;">${result.phone_number}</strong>.<br/>
              On most AU phones: dial <strong style="color: #4A9FE8;">**21*${result.phone_number}#</strong> to activate forwarding.<br/>
              Or contact your telco (Telstra/Optus/Vodafone) to set it up.
            </p>
          </div>
          <a href="https://app.talkmate.com.au/dashboard" style="display: inline-block; background: #E8622A; color: white; font-size: 16px; font-weight: 700; padding: 16px 32px; border-radius: 10px; text-decoration: none;">Go to Dashboard</a>
          <p style="font-size: 13px; color: rgba(255,255,255,0.35); margin-top: 28px;">Questions? Reply to this email. We are a real team on the Gold Coast.</p>
        </div>
      `,
    }).catch(console.error)
  }

  await sendAdminTelegram(
    `${business?.name} approved and live. Phone: ${result.phone_number ?? 'manual provisioning needed'}`,
  ).catch(() => {})

  return NextResponse.json({ success: true, twilioNumber: result.phone_number })
}
