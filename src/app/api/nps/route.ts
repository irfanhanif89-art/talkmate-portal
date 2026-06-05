import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendInternalAlert } from '@/lib/alerts'
import { postEmailTrigger } from '@/lib/make-webhook'
import { sendSMS, normaliseAuPhone } from '@/lib/sms'
import { getOrCreateReferralCode } from '@/lib/referral'

// POST /api/nps  body: { score: 1..10, trigger: "day30"|"day90" }
// Records the response and fires internal alerts on detractor scores.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const score = Number(body.score)
  const trigger = body.trigger as 'day30' | 'day90'
  if (!score || score < 1 || score > 10) return NextResponse.json({ ok: false, error: 'invalid score' }, { status: 400 })
  if (trigger !== 'day30' && trigger !== 'day90') return NextResponse.json({ ok: false, error: 'invalid trigger' }, { status: 400 })

  const admin = createAdminClient()
  const { data: business } = await admin.from('businesses')
    .select('id, name, owner_phone, owner_marketing_sms_consent, referral_prompt_sent')
    .eq('owner_user_id', user.id).maybeSingle()

  await admin.from('nps_responses').upsert({
    user_id: user.id,
    business_id: business?.id ?? null,
    score, trigger,
  }, { onConflict: 'user_id,trigger' })

  // Detractor → internal alert + email trigger
  if (score <= 6) {
    await sendInternalAlert(admin, {
      userId: user.id,
      businessId: business?.id,
      type: 'nps_low',
      severity: 'critical',
      message: `${business?.name ?? 'A client'} scored ${score}/10 on day ${trigger.replace('day', '')}`,
      subject: `⚠️ Low NPS — ${business?.name ?? 'Client'} scored ${score}/10 on ${trigger}`,
      html: `<p><strong>${business?.name ?? 'Client'}</strong> (${user.email}) gave NPS <strong>${score}/10</strong> on <strong>${trigger}</strong>. Reach out before they churn.</p>`,
    })
    await postEmailTrigger({
      event: 'nps_low_score',
      userId: user.id,
      businessId: business?.id,
      email: user.email ?? undefined,
      data: { score, trigger, businessName: business?.name },
    })
  }

  // Promoter (>=8): send ONE referral-prompt SMS, gated on owner marketing
  // consent (Spam Act). Neutral copy + STOP. Manual credit handled on redemption.
  if (score >= 8 && business?.id && business.owner_marketing_sms_consent && !business.referral_prompt_sent) {
    const to = normaliseAuPhone((business.owner_phone as string | null) ?? '')
    if (to) {
      try {
        const code = await getOrCreateReferralCode(business.id, admin)
        const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.talkmate.com.au'
        const res = await sendSMS({
          to,
          clientId: business.id,
          smsType: 'referral_prompt',
          message: `Thanks for the great feedback! Know another business that could use TalkMate? Share your link: ${base}/refer/${code} and we will thank you both. Reply STOP to opt out.`,
        })
        if (res.success) {
          await admin.from('businesses')
            .update({ referral_prompt_sent: true, referral_prompt_sent_at: new Date().toISOString() })
            .eq('id', business.id)
        }
      } catch (e) {
        console.error('[nps] referral prompt failed', (e as Error).message)
      }
    }
  }

  return NextResponse.json({ ok: true, isPromoter: score >= 9 })
}

// GET — used by the dashboard to know whether to show the popup.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { data: rows } = await supabase
    .from('nps_responses')
    .select('trigger')
    .eq('user_id', user.id)

  const responded = new Set((rows ?? []).map(r => r.trigger))
  return NextResponse.json({ ok: true, respondedDay30: responded.has('day30'), respondedDay90: responded.has('day90') })
}
