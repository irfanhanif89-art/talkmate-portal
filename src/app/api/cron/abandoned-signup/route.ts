import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_hH6pbyrr_BgLjFBZyiHwaErEyibPgtVpm'

async function sendEmail(to: string, subject: string, html: string) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'TalkMate <hello@talkmate.com.au>', to, subject, html }),
  })
}

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createAdminClient()
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000)

  // Find users who registered but have no active subscription
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, owner_user_id, created_at')
    .is('stripe_customer_id', null)
    .gte('created_at', fortyEightHoursAgo.toISOString())

  if (!businesses?.length) return NextResponse.json({ sent: 0 })

  let sent = 0

  for (const biz of businesses) {
    // Double-check no subscription exists
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('business_id', biz.id)
      .in('status', ['active', 'trialing'])
      .maybeSingle()

    if (sub) continue

    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('id', biz.owner_user_id)
      .single()

    if (!user?.email) continue

    const createdAt = new Date(biz.created_at)
    const ageMs = now.getTime() - createdAt.getTime()

    // 1-hour email: registered between 55min and 65min ago
    if (ageMs >= 55 * 60 * 1000 && ageMs <= 65 * 60 * 1000) {
      await sendEmail(
        user.email,
        `${biz.name} — your AI receptionist is one step away`,
        `<div style="font-family: 'Outfit', sans-serif; max-width: 560px; margin: 0 auto; background: #061322; color: white; padding: 40px; border-radius: 16px;">
          <div style="margin-bottom: 28px;"><span style="font-size: 28px; font-weight: 800; color: white;">Talk</span><span style="font-size: 18px; font-weight: 300; color: #4A9FE8; letter-spacing: 4px;">Mate</span></div>
          <h1 style="font-size: 26px; font-weight: 800; color: white; margin-bottom: 12px; line-height: 1.2;">You're one step away.</h1>
          <p style="font-size: 16px; color: rgba(255,255,255,0.7); line-height: 1.7; margin-bottom: 16px;">
            You created your TalkMate account for <strong style="color: white;">${biz.name}</strong> but haven't chosen a plan yet.
          </p>
          <p style="font-size: 16px; color: rgba(255,255,255,0.7); line-height: 1.7; margin-bottom: 32px;">
            Right now, every call that rings out while you're busy is a customer who won't call back. That ends the moment you go live.
          </p>
          <a href="https://app.talkmate.com.au/subscribe" style="display: inline-block; background: #E8622A; color: white; font-size: 16px; font-weight: 700; padding: 16px 32px; border-radius: 10px; text-decoration: none; margin-bottom: 32px;">Choose Your Plan →</a>
          <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <p style="font-size: 14px; color: rgba(255,255,255,0.65); margin: 0; line-height: 1.7;">
              ✓ No setup fees &nbsp;·&nbsp; ✓ Live in 24 hours &nbsp;·&nbsp; ✓ 14-day money-back guarantee
            </p>
          </div>
          <p style="font-size: 13px; color: rgba(255,255,255,0.35);">Plans from $299/month. Cancel anytime.</p>
        </div>`
      )
      sent++
    }

    // 24-hour email: registered between 23hr and 25hr ago
    if (ageMs >= 23 * 60 * 60 * 1000 && ageMs <= 25 * 60 * 60 * 1000) {
      await sendEmail(
        user.email,
        `Still thinking? Here's what ${biz.name} is missing right now`,
        `<div style="font-family: 'Outfit', sans-serif; max-width: 560px; margin: 0 auto; background: #061322; color: white; padding: 40px; border-radius: 16px;">
          <div style="margin-bottom: 28px;"><span style="font-size: 28px; font-weight: 800; color: white;">Talk</span><span style="font-size: 18px; font-weight: 300; color: #4A9FE8; letter-spacing: 4px;">Mate</span></div>
          <h1 style="font-size: 26px; font-weight: 800; color: white; margin-bottom: 12px; line-height: 1.2;">Since you signed up yesterday...</h1>
          <p style="font-size: 16px; color: rgba(255,255,255,0.7); line-height: 1.7; margin-bottom: 24px;">
            The average Australian restaurant misses <strong style="color: white;">20–30 calls</strong> every day they don't have an AI receptionist. At $75 average order value, that's up to <strong style="color: #E8622A;">$2,250 in lost revenue — yesterday alone.</strong>
          </p>
          <p style="font-size: 16px; color: rgba(255,255,255,0.7); line-height: 1.7; margin-bottom: 32px;">
            TalkMate pays for itself the first week. No lock-in. 14-day money-back guarantee.
          </p>
          <a href="https://app.talkmate.com.au/subscribe" style="display: inline-block; background: #E8622A; color: white; font-size: 16px; font-weight: 700; padding: 16px 32px; border-radius: 10px; text-decoration: none; margin-bottom: 16px;">Get Started From $299/mo →</a>
          <br/>
          <a href="https://talkmate.com.au" style="display: inline-block; font-size: 14px; color: #4A9FE8; text-decoration: none; margin-top: 8px;">Hear a live demo first →</a>
          <p style="font-size: 13px; color: rgba(255,255,255,0.35); margin-top: 32px;">This is the last email we'll send. No pressure — your account stays open whenever you're ready.</p>
        </div>`
      )
      sent++
    }
  }

  return NextResponse.json({ sent, checked: businesses.length })
}
