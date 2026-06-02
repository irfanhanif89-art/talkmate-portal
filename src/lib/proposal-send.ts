// Shared proposal-email core. Used by both the lead-scoped send route
// (/api/sales/send-proposal) and the standalone "quick send" route
// (/api/sales/proposals/quick-send). Renders a branded A4 PDF proposal,
// emails it from hello@talkmate.com.au as an attachment with a tokenised
// "Ready to go ahead" accept link, records proposal_tracking + lead_activities,
// and advances the lead status — so both entry points behave identically.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/resend'
import { renderHtmlToPdf } from '@/lib/proposal/render-pdf'
import { fillTemplate, featurePlan } from '@/lib/proposal/fill-template'
import { computeRoi, ROI_DEFAULTS, type RoiInput } from '@/lib/proposal/roi'
import { generateAcceptToken } from '@/lib/proposal/token'
import { inlineFonts } from '@/lib/proposal/inline-fonts'
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
  /** ROI figures shown on the proposal PDF. Defaults to ROI_DEFAULTS when omitted. */
  roi?: RoiInput
  /** Override the base URL used for the accept link (defaults to NEXT_PUBLIC_APP_URL). */
  appUrl?: string
}

export type SendProposalResult =
  | { ok: true; proposalId: string | null }
  | { ok: false; error: string; status: number }

// Cover note that carries the attached PDF proposal. Holds the tokenised
// "Ready to go ahead" button (the PDF itself has no per-lead accept hook) and
// surfaces the rep's personalised note if one was supplied.
function proposalCoverHtml(o: {
  contactName: string | null
  businessName: string
  acceptUrl: string
  repFullName: string
  personalisedNote: string | null
}) {
  const esc = (s: string) => s.replace(/[&<>"']/g, ch => (
    ch === '&' ? '&amp;' :
    ch === '<' ? '&lt;'  :
    ch === '>' ? '&gt;'  :
    ch === '"' ? '&quot;': '&#39;'
  ))
  return `
  <div style="font-family:'Outfit',Arial,sans-serif;max-width:600px;margin:0 auto;color:#061322;">
    <div style="background:#061322;padding:22px 28px;"><div style="font-size:22px;font-weight:800;color:#fff;">Talk<span style="color:#E8622A;">Mate</span></div></div>
    <div style="height:3px;background:#E8622A;"></div>
    <div style="padding:28px;">
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">Hi ${esc(o.contactName ?? 'there')},</p>
      ${o.personalisedNote ? `<p style="font-size:15px;line-height:1.6;margin:0 0 14px;color:#34495e;">${esc(o.personalisedNote)}</p>` : ''}
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">Your TalkMate proposal for <strong>${esc(o.businessName)}</strong> is attached as a PDF. It covers how TalkMate answers every call, what it is worth to your business, and the plan options.</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 22px;">When you are ready, just tap the button below.</p>
      <p style="margin:0 0 24px;"><a href="${o.acceptUrl}" style="display:inline-block;padding:14px 26px;background:#E8622A;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;">Ready to go ahead</a></p>
      <p style="font-size:14px;color:#34495e;margin:0;">${esc(o.repFullName)}<br/>TalkMate</p>
    </div>
    <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #eef0f3;font-size:11px;color:#7BAED4;">TalkMate. AI Receptionist for Australian Small Business. talkmate.com.au</div>
  </div>`
}

// Builds and sends the proposal email for an existing lead, then records
// tracking + activity and advances status. Caller must have already
// validated the rep, the rep's notification_email, and that lead.email
// is present.
export async function sendProposalForLead(args: SendProposalArgs): Promise<SendProposalResult> {
  const { lead, rep, plan, templateType, personalisedNote } = args
  const admin = createAdminClient()

  const subject = templateType === 'full'
    ? `Your TalkMate Proposal for ${lead.business_name}`
    : `Great chatting, ${lead.contact_name ?? 'there'}. Here is what we covered.`

  // Accept link token (persisted on the tracking row below).
  const token = generateAcceptToken()
  const appUrl = args.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.talkmate.com.au'
  const acceptUrl = `${appUrl}/p/accept/${token}`

  // Build the branded proposal PDF from the vendored template.
  const roi = computeRoi(args.roi ?? ROI_DEFAULTS)
  const todayAu = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

  let proposalHtml = readFileSync(
    join(process.cwd(), 'src/lib/proposal/templates/towing-proposal.html'), 'utf8',
  )
  proposalHtml = featurePlan(proposalHtml, plan)
  proposalHtml = fillTemplate(proposalHtml, {
    business: lead.business_name,
    contact: lead.contact_name,
    rep: rep.full_name,
    phone: rep.phone,
    email: rep.notification_email,
    date: todayAu,
    ...roi,
  })
  // REQUIRED: headless Chromium setContent() has no origin, so /fonts URLs
  // cannot resolve — inline them before rendering or the PDF falls back to Arial.
  proposalHtml = inlineFonts(proposalHtml)

  const pdfBytes = await renderHtmlToPdf(proposalHtml)
  const pdfBase64 = Buffer.from(pdfBytes).toString('base64')

  const fromAddr = process.env.PROPOSAL_EMAIL_FROM ?? 'hello@talkmate.com.au'
  const coverHtml = proposalCoverHtml({
    contactName: lead.contact_name,
    businessName: lead.business_name,
    acceptUrl,
    repFullName: rep.full_name,
    personalisedNote,
  })

  const result = await sendEmail({
    from: `TalkMate <${fromAddr}>`,
    replyTo: fromAddr,
    to: lead.email,
    subject,
    html: coverHtml,
    attachments: [{ filename: `TalkMate Proposal - ${lead.business_name}.pdf`, content: pdfBase64 }],
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
      accept_token: token,
      template_type: templateType,
      selected_plan: plan,
    })
    .select('id')
    .maybeSingle()

  // Move status forward unless terminal.
  if (!['proposal_sent', 'proposal_accepted', 'won', 'lost', 'bad_lead'].includes(lead.status)) {
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
