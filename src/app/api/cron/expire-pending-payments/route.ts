import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/resend'
import { sendAdminTelegram } from '@/lib/notifications'

// Session 27 (H1, M1) — rescue stranded pay-now signups.
//
// When a user picks Pay Now at signup but closes the Stripe tab without
// completing, their business sits in account_status='pending_payment'
// forever (Stripe never fires checkout.session.completed). This cron
// runs daily, finds any pending_payment row older than 24h, flips it
// to 'trial' so they can resume, and emails the owner.

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: stranded } = await supabase
    .from('businesses')
    .select('id, name, owner_user_id, created_at')
    .eq('account_status', 'pending_payment')
    .lt('created_at', cutoff)

  const rows = stranded ?? []
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, reset: 0 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.talkmate.com.au'
  const now = new Date()
  const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  let resetCount = 0

  for (const biz of rows) {
    // Convert to trial so middleware no longer blocks dashboard access.
    const { error } = await supabase
      .from('businesses')
      .update({
        account_status: 'trial',
        trial_start_date: now.toISOString(),
        trial_end_date: trialEnd.toISOString(),
      })
      .eq('id', biz.id)
    if (error) {
      console.error('[expire-pending-payments] update failed for', biz.id, error.message)
      continue
    }
    resetCount += 1

    // Notify the owner — best effort.
    try {
      const { data: owner } = await supabase
        .from('users')
        .select('email, full_name')
        .eq('id', biz.owner_user_id)
        .maybeSingle()
      if (owner?.email) {
        const firstName = (owner.full_name ?? '').split(' ')[0] || 'there'
        await sendEmail({
          to: owner.email,
          subject: `We've started your TalkMate trial — let's finish setup`,
          replyTo: 'hello@talkmate.com.au',
          html: `
            <div style="font-family:'Outfit',sans-serif;max-width:560px;margin:0 auto;background:#061322;color:white;padding:40px;border-radius:16px;">
              <h1 style="font-size:24px;font-weight:800;margin:0 0 14px 0;line-height:1.25;">We've started your TalkMate trial.</h1>
              <p style="color:rgba(255,255,255,0.75);line-height:1.7;margin:0 0 18px 0;">
                Hi ${firstName}, we noticed your payment for ${biz.name ?? 'your business'} didn't complete, so we've started a 7-day free trial instead. You can finish setup any time.
              </p>
              <a href="${appUrl}/onboarding" style="display:inline-block;background:#E8622A;color:white;font-size:15px;font-weight:700;padding:14px 28px;border-radius:10px;text-decoration:none;margin-bottom:24px;">
                Finish setup
              </a>
              <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:18px 0 0 0;">
                You can switch to a paid plan from your billing page any time. Reply to this email if you need help.
              </p>
            </div>
          `,
        })
      }
    } catch (e) {
      console.error('[expire-pending-payments] email failed for', biz.id, (e as Error).message)
    }
  }

  // Operator heads-up so Irfan knows pending_payment users were rescued.
  if (resetCount > 0) {
    await sendAdminTelegram(
      `🔄 expire-pending-payments\nReset ${resetCount} stranded pay-now signup${resetCount === 1 ? '' : 's'} to trial.\nNames: ${rows.map(r => r.name ?? '(unknown)').slice(0, 5).join(', ')}${rows.length > 5 ? ` and ${rows.length - 5} more` : ''}`,
    )
  }

  return NextResponse.json({ ok: true, reset: resetCount })
}
