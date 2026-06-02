// PUBLIC (no-auth) proposal-acceptance route.
//
// A prospect taps the "Ready to go ahead" button in their proposal email,
// which points at /p/accept/<accept_token>. This route:
//   1. looks up the proposal_tracking row by its opaque accept_token,
//   2. renders the personalised confirmation screen (served from a real
//      origin, so the template's /fonts URLs resolve — do NOT inline),
//   3. on the FIRST visit only, records the acceptance and notifies the team.
//
// Security: there is no auth here by design. The route is reachable only with
// the unguessable per-proposal token, and it never renders anything beyond the
// confirmation page for that one proposal. No lead/rep PII leaks without the
// token. The record/notify side-effects are idempotent — re-visits re-render
// the page but never re-fire the email or re-insert the activity.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/resend'
import { fillTemplate } from '@/lib/proposal/fill-template'
import { PRICING, isPricingPlan } from '@/lib/pricing'

export const dynamic = 'force-dynamic'

function page(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const admin = createAdminClient()

  const { data: tracking } = await admin
    .from('proposal_tracking')
    .select('id, lead_id, rep_id, selected_plan, accepted_at')
    .eq('accept_token', token)
    .maybeSingle()

  if (!tracking) {
    return page(
      '<p style="font-family:sans-serif;padding:40px;text-align:center">This link is no longer valid. Please contact your TalkMate rep.</p>',
      404,
    )
  }

  const { data: lead } = await admin
    .from('leads')
    .select('business_name, contact_name')
    .eq('id', tracking.lead_id)
    .maybeSingle()

  // Rep is loaded from sales_reps (same table requireSalesRep uses). Real
  // columns: full_name, phone, notification_email (nullable), email.
  const { data: rep } = await admin
    .from('sales_reps')
    .select('full_name, phone, notification_email, email')
    .eq('id', tracking.rep_id)
    .maybeSingle()

  const plan = isPricingPlan(tracking.selected_plan) ? tracking.selected_plan : 'growth'
  const meta = PRICING[plan]

  const repEmail = rep?.notification_email ?? rep?.email ?? null

  // Record the acceptance exactly once. Re-visits short-circuit here, so the
  // notification email and lead_activities row are never duplicated.
  if (!tracking.accepted_at) {
    const nowIso = new Date().toISOString()
    await admin.from('proposal_tracking').update({ accepted_at: nowIso }).eq('id', tracking.id)
    await admin
      .from('leads')
      .update({ status: 'proposal_accepted', updated_at: nowIso })
      .eq('id', tracking.lead_id)
    await admin.from('lead_activities').insert({
      lead_id: tracking.lead_id,
      rep_id: tracking.rep_id,
      activity_type: 'proposal',
      title: 'Proposal accepted by client',
    })
    await sendEmail({
      from: 'TalkMate <hello@talkmate.com.au>',
      replyTo: 'hello@talkmate.com.au',
      to: repEmail ? ['hello@talkmate.com.au', repEmail] : 'hello@talkmate.com.au',
      subject: `Proposal accepted: ${lead?.business_name ?? 'Client'}`,
      html: `<p style="font-family:sans-serif">${lead?.business_name ?? 'A client'} (${lead?.contact_name ?? ''}) accepted the ${plan} proposal.</p>`,
    })
  }

  let html = readFileSync(
    join(process.cwd(), 'src/lib/proposal/templates/confirmation.html'),
    'utf8',
  )
  html = fillTemplate(html, {
    contact: lead?.contact_name ?? 'there',
    business: lead?.business_name ?? 'your business',
    selected_plan: plan.charAt(0).toUpperCase() + plan.slice(1),
    selected_plan_price: '$' + meta.monthly,
    setup_fee: '$' + meta.setup_fee,
    rep: rep?.full_name ?? 'Your TalkMate rep',
    phone: rep?.phone ?? '',
    email: repEmail ?? 'hello@talkmate.com.au',
  })

  return page(html)
}
