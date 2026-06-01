// Shared proposal-email core. Used by both the lead-scoped send route
// (/api/sales/send-proposal) and the standalone "quick send" route
// (/api/sales/proposals/quick-send). Builds the branded HTML, sends via
// Resend, records proposal_tracking + lead_activities, and advances the
// lead status — so both entry points behave identically.

import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/resend'
import { toSalesIndustrySlug } from '@/lib/industry-slugs'
import { INDUSTRY_BULLETS, DEFAULT_BULLETS, PLAN_FEATURES } from '@/lib/proposal-content'
import type { CommissionPlan } from '@/lib/commission'

export type TemplateType = 'full' | 'post_demo'

export interface ProposalLead {
  id: string
  business_name: string
  contact_name: string | null
  email: string
  industry: string | null
  status: string
}

export interface ProposalRep {
  id: string
  full_name: string
  phone: string | null
  notification_email: string
}

export interface SendProposalArgs {
  lead: ProposalLead
  rep: ProposalRep
  plan: CommissionPlan
  templateType: TemplateType
  personalisedNote: string | null
}

export type SendProposalResult =
  | { ok: true; proposalId: string | null }
  | { ok: false; error: string; status: number }

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
  plan: CommissionPlan
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
  plan: CommissionPlan
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

// Builds and sends the proposal email for an existing lead, then records
// tracking + activity and advances status. Caller must have already
// validated the rep, the rep's notification_email, and that lead.email
// is present.
export async function sendProposalForLead(args: SendProposalArgs): Promise<SendProposalResult> {
  const { lead, rep, plan, templateType, personalisedNote } = args
  const admin = createAdminClient()

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
        plan,
        personalisedNote,
        repFullName: rep.full_name,
        repPhone: rep.phone,
        repNotificationEmail: rep.notification_email,
      })
    : postDemoHtml({
        contactName: lead.contact_name,
        businessName: lead.business_name,
        plan,
        personalisedNote,
        repFullName: rep.full_name,
        repPhone: rep.phone,
      })

  const result = await sendEmail({
    from: `TalkMate Sales <${process.env.SALES_EMAIL_FROM ?? 'sales@talkmate.com.au'}>`,
    replyTo: rep.notification_email,
    to: lead.email,
    subject,
    html,
  })

  if (!result.ok) {
    return { ok: false, error: result.error ?? 'Email send failed', status: 500 }
  }

  const { data: tracking } = await admin
    .from('proposal_tracking')
    .insert({
      lead_id: lead.id,
      rep_id: rep.id,
      resend_email_id: result.id ?? null,
      plan,
    })
    .select('id')
    .maybeSingle()

  // Move status forward unless terminal.
  if (!['proposal_sent', 'won', 'lost', 'bad_lead'].includes(lead.status)) {
    await admin.from('leads').update({
      status: 'proposal_sent',
      updated_at: new Date().toISOString(),
    }).eq('id', lead.id)
  }

  await admin.from('lead_activities').insert({
    lead_id: lead.id,
    rep_id: rep.id,
    activity_type: 'proposal',
    title: `Proposal sent: ${plan} plan (${templateType === 'full' ? 'full' : 'post-demo'})`,
  })

  return { ok: true, proposalId: tracking?.id ?? null }
}
