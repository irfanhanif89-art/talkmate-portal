import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { createSystemAlert, sendInternalEmail } from '@/lib/alerts'
import { postEmailTrigger } from '@/lib/make-webhook'
import { sendSMS, normaliseAuPhone } from '@/lib/sms'

// Brief Part 4 — Day-7 onboarding incomplete alert.
// Daily. Find any user past day-7 of signup who hasn't completed onboarding,
// log a SystemAlert and email hello@talkmate.com.au.
export async function GET(req: Request) {
  const guard = verifyCron(req); if (guard) return guard

  const supabase = createAdminClient()
  const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)

  const { data: candidates } = await supabase
    .from('businesses')
    .select('id, name, owner_user_id, phone_number, signup_at, onboarding_completed')
    .eq('onboarding_completed', false)
    .gte('signup_at', eightDaysAgo.toISOString())
    .lte('signup_at', sixDaysAgo.toISOString())

  let alerted = 0
  for (const b of candidates ?? []) {
    // Don't double-alert
    const { data: existing } = await supabase.from('system_alerts').select('id')
      .eq('business_id', b.id).eq('type', 'onboarding_incomplete').eq('resolved', false).maybeSingle()
    if (existing) continue

    const { data: ownerRow } = await supabase.from('users').select('email').eq('id', b.owner_user_id).single()
    const ownerEmail = ownerRow?.email ?? ''

    await createSystemAlert(supabase, {
      userId: b.owner_user_id, businessId: b.id,
      type: 'onboarding_incomplete', severity: 'warning',
      message: `${b.name} reached day 7 without completing onboarding`,
    })
    await sendInternalEmail(
      `⚠️ ${b.name} hasn't completed onboarding — day 7`,
      `<p><strong>${b.name}</strong> (${ownerEmail}, ${b.phone_number ?? 'no phone'}) reached day 7 without completing onboarding.</p>
       <p><a href="https://app.talkmate.com.au/admin">Open admin →</a></p>`,
    )
    await postEmailTrigger({
      event: 'onboarding_incomplete_day7',
      userId: b.owner_user_id,
      businessId: b.id,
      email: ownerEmail,
      data: { businessName: b.name, phone: b.phone_number },
    })
    alerted++
  }

  // Session 4B — owner-facing setup nudges (day 3 KB, day 14 chatbot).
  // SAFETY: default-OFF. Only runs when ONBOARDING_NUDGES_ENABLED === 'true'
  // so it deploys inert and can be enabled on a test business first. Activation
  // is derived from real timestamps (never created_at). Established clients like
  // GM Towing / Spectrum fall outside the day-3/14 windows.
  let nudged = 0
  if (process.env.ONBOARDING_NUDGES_ENABLED === 'true') {
    const { data: actives } = await supabase
      .from('businesses')
      .select('id, name, owner_phone, plan, chatbot_enabled, account_status, payment_confirmed_at, golive_verified_at, trial_converted_at')
      .in('account_status', ['active', 'trial'])
      .limit(500)

    const url = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.talkmate.com.au'
    for (const b of actives ?? []) {
      const activatedRaw = (b.payment_confirmed_at as string | null)
        || (b.golive_verified_at as string | null)
        || (b.trial_converted_at as string | null)
      if (!activatedRaw) continue
      const days = (Date.now() - Date.parse(activatedRaw)) / 86_400_000
      const to = normaliseAuPhone((b.owner_phone as string | null) ?? '')
      if (!to) continue

      // Day 3 — knowledge base nearly empty.
      if (days >= 3 && days < 4) {
        const { data: dupe } = await supabase.from('system_alerts').select('id')
          .eq('business_id', b.id).eq('type', 'onboarding_nudge_day3').maybeSingle()
        if (dupe) continue
        const { count: kb } = await supabase.from('knowledge_base_entries')
          .select('id', { count: 'exact', head: true }).eq('business_id', b.id)
        if ((kb ?? 0) >= 5) continue
        const res = await sendSMS({
          to, clientId: b.id as string, smsType: 'onboarding_nudge',
          message: `Your TalkMate agent is live but its knowledge base is nearly empty. Add your services and FAQs so it can answer properly. Takes 5 minutes: ${url}/train. Reply STOP to opt out.`,
        })
        if (res.success) { nudged++; await createSystemAlert(supabase, { businessId: b.id as string, type: 'onboarding_nudge_day3', severity: 'warning', message: `Day-3 KB nudge sent to ${b.name}` }) }
        continue
      }

      // Day 14 — Growth/Pro chatbot not set up.
      if (days >= 14 && days < 15 && !b.chatbot_enabled && (b.plan === 'growth' || b.plan === 'pro')) {
        const { data: dupe } = await supabase.from('system_alerts').select('id')
          .eq('business_id', b.id).eq('type', 'onboarding_nudge_day14').maybeSingle()
        if (dupe) continue
        const res = await sendSMS({
          to, clientId: b.id as string, smsType: 'onboarding_nudge',
          message: `Your plan includes a website chatbot you haven't set up yet. Add it to your website in 2 minutes: ${url}/chatbot. Reply STOP to opt out.`,
        })
        if (res.success) { nudged++; await createSystemAlert(supabase, { businessId: b.id as string, type: 'onboarding_nudge_day14', severity: 'warning', message: `Day-14 chatbot nudge sent to ${b.name}` }) }
      }
    }
  }

  return NextResponse.json({ ok: true, candidates: candidates?.length ?? 0, alerted, nudged })
}
