import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { sendEmail } from '@/lib/resend'
import { isCommissionPlan } from '@/lib/commission'
import { toSalesIndustrySlug } from '@/lib/industry-slugs'
import { INDUSTRY_BULLETS, DEFAULT_BULLETS, PLAN_FEATURES } from '@/lib/proposal-content'

type TemplateType = 'full' | 'post_demo'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => (
    ch === '&' ? '&amp;' :
    ch === '<' ? '&lt;'  :
    ch === '>' ? '&gt;'  :
    ch === '"' ? '&quot;': '&#39;'
  ))
}

function fullProposalHtml(opts: {
  contactName: string | null
  businessName: string
  bullets: string[]
  plan: 'starter' | 'growth' | 'pro'
  personalisedNote: string | null
  repFullName: string
  repPhone: string | null
  repNotificationEmail: string
}) {
  const planLabel = opts.plan.charAt(0).toUpperCase() + opts.plan.slice(1)
  const planMeta = PLAN_FEATURES[opts.plan]

  return `
  <div style="font-family: 'Outfit', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; color: #061322;">
    <div style="background: #061322; padding: 26px 32px;">
      <div style="font-size: 24px; font-weight: 800; color: white;">
        Talk<span style="color: #E8622A;">Mate</span>
      </div>
    </div>
    <div style="height: 3px; background: #E8622A;"></div>
    <div style="padding: 32px;">
      <p style="font-size: 16px; margin: 0 0 14px;">Hi ${escapeHtml(opts.contactName ?? 'there')},</p>
      ${opts.personalisedNote ? `<p style="font-size: 15px; line-height: 1.65; margin: 0 0 18px; color: #34495e;">${escapeHtml(opts.personalisedNote)}</p>` : ''}
      <p style="font-size: 15px; line-height: 1.65; margin: 0 0 12px;">Here is what TalkMate will do for <strong>${escapeHtml(opts.businessName)}</strong>:</p>
      <ul style="font-size: 15px; line-height: 1.7; margin: 0 0 22px; padding-left: 22px; color: #34495e;">
        ${opts.bullets.map(b => `<li style="margin-bottom: 6px;">${escapeHtml(b)}</li>`).join('')}
      </ul>

      <div style="background: #f4f5f7; border-radius: 12px; padding: 22px; margin: 0 0 22px;">
        <div style="font-size: 12px; color: #7BAED4; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;">${escapeHtml(planLabel)} plan</div>
        <div style="font-size: 32px; font-weight: 800; color: #061322; margin: 4px 0 14px;">$${planMeta.price}<span style="font-size: 14px; font-weight: 600; color: #7BAED4;">/month</span></div>
        <ul style="font-size: 14px; line-height: 1.7; margin: 0; padding-left: 20px; color: #34495e;">
          ${planMeta.features.map(f => `<li>${escapeHtml(f)}</li>`).join('')}
        </ul>
      </div>

      <p style="font-size: 13px; color: #7BAED4; margin: 0 0 22px;">
        No lock-in contracts. Cancel anytime. Setup included in your fee. 14-day money-back guarantee.
      </p>

      <p style="margin: 0 0 26px;">
        <a href="https://talkmate.com.au/pricing" style="display: inline-block; padding: 14px 26px; background: #E8622A; color: white; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px;">Get Started</a>
      </p>

      <p style="font-size: 14px; line-height: 1.6; margin: 0; color: #34495e;">
        ${escapeHtml(opts.repFullName)}<br/>
        ${opts.repPhone ? escapeHtml(opts.repPhone) + '<br/>' : ''}
        <a href="mailto:${escapeHtml(opts.repNotificationEmail)}" style="color: #E8622A; text-decoration: none;">${escapeHtml(opts.repNotificationEmail)}</a>
      </p>
    </div>
    <div style="padding: 18px 32px; background: #f9fafb; border-top: 1px solid #eef0f3; font-size: 11px; color: #7BAED4;">
      TalkMate. AI Receptionist for Australian Small Business. <a href="https://talkmate.com.au" style="color: #7BAED4;">talkmate.com.au</a>
    </div>
  </div>`
}

function postDemoHtml(opts: {
  contactName: string | null
  businessName: string
  plan: 'starter' | 'growth' | 'pro'
  personalisedNote: string | null
  repFullName: string
  repPhone: string | null
}) {
  const planLabel = opts.plan.charAt(0).toUpperCase() + opts.plan.slice(1)
  const planPrice = PLAN_FEATURES[opts.plan].price

  return `
  <div style="font-family: 'Outfit', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; color: #061322;">
    <div style="background: #061322; padding: 26px 32px;">
      <div style="font-size: 24px; font-weight: 800; color: white;">
        Talk<span style="color: #E8622A;">Mate</span>
      </div>
    </div>
    <div style="height: 3px; background: #E8622A;"></div>
    <div style="padding: 32px;">
      <p style="font-size: 16px; margin: 0 0 14px;">Hi ${escapeHtml(opts.contactName ?? 'there')},</p>
      <p style="font-size: 15px; line-height: 1.65; margin: 0 0 14px;">Wanted to make sure everything from our call landed okay.</p>
      ${opts.personalisedNote ? `<p style="font-size: 15px; line-height: 1.65; margin: 0 0 18px; color: #34495e;">${escapeHtml(opts.personalisedNote)}</p>` : ''}
      <p style="font-size: 15px; line-height: 1.65; margin: 0 0 22px;">The plan I recommended for <strong>${escapeHtml(opts.businessName)}</strong> was <strong>${escapeHtml(planLabel)}</strong> at <strong>$${planPrice}/month</strong>.</p>
      <p style="font-size: 15px; line-height: 1.65; margin: 0 0 22px;">Happy to answer any questions, just reply to this email or call me directly.</p>

      <p style="margin: 0 0 26px;">
        <a href="https://talkmate.com.au/pricing" style="display: inline-block; padding: 14px 26px; background: #E8622A; color: white; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px;">Review your proposal</a>
      </p>

      <p style="font-size: 14px; line-height: 1.6; margin: 0; color: #34495e;">
        ${escapeHtml(opts.repFullName)}${opts.repPhone ? ' | ' + escapeHtml(opts.repPhone) : ''}
      </p>
    </div>
  </div>`
}

export async function POST(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  if (!auth.rep.notification_email) {
    return NextResponse.json(
      { ok: false, error: 'Set your reply-to email in Profile first.' },
      { status: 400 },
    )
  }

  const body = await req.json().catch(() => ({})) as {
    lead_id?: string
    plan?: string
    personalised_note?: string
    template_type?: string
  }

  if (!body.lead_id) return NextResponse.json({ ok: false, error: 'lead_id required' }, { status: 400 })
  if (!isCommissionPlan(body.plan)) {
    return NextResponse.json({ ok: false, error: 'plan must be starter, growth, or pro' }, { status: 400 })
  }
  const templateType: TemplateType = body.template_type === 'post_demo' ? 'post_demo' : 'full'
  const personalisedNote = (body.personalised_note ?? '').trim().slice(0, 200) || null

  const admin = createAdminClient()
  const { data: lead } = await admin
    .from('leads')
    .select('id, assigned_to, business_name, contact_name, email, industry, status')
    .eq('id', body.lead_id)
    .maybeSingle()

  if (!lead || lead.assigned_to !== auth.rep.id) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
  }
  if (!lead.email) {
    return NextResponse.json({ ok: false, error: 'Lead has no email on file' }, { status: 400 })
  }

  const slug = toSalesIndustrySlug(lead.industry)
  const bullets = slug && INDUSTRY_BULLETS[slug] ? INDUSTRY_BULLETS[slug] : DEFAULT_BULLETS

  const subject = templateType === 'full'
    ? `Your TalkMate Proposal for ${lead.business_name}`
    : `Great chatting, ${lead.contact_name ?? 'there'}. Here is what we covered.`

  const html = templateType === 'full'
    ? fullProposalHtml({
        contactName: lead.contact_name,
        businessName: lead.business_name,
        bullets,
        plan: body.plan,
        personalisedNote,
        repFullName: auth.rep.full_name,
        repPhone: auth.rep.phone,
        repNotificationEmail: auth.rep.notification_email,
      })
    : postDemoHtml({
        contactName: lead.contact_name,
        businessName: lead.business_name,
        plan: body.plan,
        personalisedNote,
        repFullName: auth.rep.full_name,
        repPhone: auth.rep.phone,
      })

  const result = await sendEmail({
    from: `TalkMate Sales <${process.env.SALES_EMAIL_FROM ?? 'sales@talkmate.com.au'}>`,
    replyTo: auth.rep.notification_email,
    to: lead.email,
    subject,
    html,
  })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? 'Email send failed' }, { status: 500 })
  }

  const { data: tracking } = await admin
    .from('proposal_tracking')
    .insert({
      lead_id: body.lead_id,
      rep_id: auth.rep.id,
      resend_email_id: result.id ?? null,
      plan: body.plan,
    })
    .select('id')
    .maybeSingle()

  // Move status forward unless terminal
  if (!['proposal_sent', 'won', 'lost', 'bad_lead'].includes(lead.status)) {
    await admin.from('leads').update({
      status: 'proposal_sent',
      updated_at: new Date().toISOString(),
    }).eq('id', body.lead_id)
  }

  await admin.from('lead_activities').insert({
    lead_id: body.lead_id,
    rep_id: auth.rep.id,
    activity_type: 'proposal',
    title: `Proposal sent: ${body.plan} plan (${templateType === 'full' ? 'full' : 'post-demo'})`,
  })

  return NextResponse.json({ ok: true, proposal_id: tracking?.id ?? null })
}
