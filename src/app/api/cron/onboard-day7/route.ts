import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { createSystemAlert, sendInternalEmail } from '@/lib/alerts'
import { postEmailTrigger } from '@/lib/make-webhook'

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

  return NextResponse.json({ ok: true, candidates: candidates?.length ?? 0, alerted })
}
