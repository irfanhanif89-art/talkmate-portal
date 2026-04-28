import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendInternalAlert } from '@/lib/alerts'
import { postEmailTrigger } from '@/lib/make-webhook'

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
  const { data: business } = await admin.from('businesses').select('id, name').eq('owner_user_id', user.id).maybeSingle()

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
