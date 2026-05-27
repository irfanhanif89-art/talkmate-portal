import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { provisionAgent } from '@/lib/provisioning/approveAgent'
import { sendEmail } from '@/lib/resend'
import { sendAdminTelegram } from '@/lib/notifications'
import { createAdminClient } from '@/lib/supabase/server'
import { dealApprovedEmailHtml } from '@/lib/sales-notify'

// Session 41 — thin wrapper. The provisioning core (Twilio + Vapi +
// checklist gate) lives in /lib/provisioning/approveAgent.ts so the new
// admin onboarding wizard Go Live route can re-use it. This wrapper
// preserves the existing external request/response shape:
//   POST { businessId } ?override=true
//   200 { success: true, twilioNumber: string|null }
//   4xx/5xx { error: string, failing_checks?: string[] }

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { businessId } = await req.json()
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 })

  const override = req.nextUrl.searchParams.get('override') === 'true'
  const result = await provisionAgent(businessId, { override })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, failing_checks: result.failing_checks },
      { status: result.status },
    )
  }

  const admin = createAdminClient()
  const { data: business } = await admin
    .from('businesses')
    .select('name, owner_user_id')
    .eq('id', businessId)
    .maybeSingle()

  // Session 51 — Go-live is now the trigger that approves the rep's
  // commission. Previously this happened on Stripe payment confirmation
  // (auto-approval in the webhook), but Irfan wants commission gated on
  // the client actually being live and using the product. So we wait
  // until the agent has been reviewed + Twilio provisioned + welcome
  // email sent, then flip the matching pending commission rows.
  //
  // The 14-day clawback gate (enforced in /api/admin/commissions/[id])
  // still applies as a separate admin action. If go-live fires before
  // the clawback window ends, we leave the commission pending with a
  // soft warning instead of blocking the go-live — client activation is
  // more important than commission timing. Admin can manually approve
  // later via /admin/sales-team once the clawback window passes.
  //
  // Lookup is via lead → matching business_id (admin's create-from-lead
  // path links business_id on the lead row).
  let commissionApprovalNote: string | null = null
  try {
    const { data: linkedLead } = await admin
      .from('leads')
      .select('id, business_name, assigned_to')
      .eq('business_id', businessId)
      .maybeSingle()
    if (linkedLead) {
      const nowIso = new Date().toISOString()
      const { data: pendingCommissions } = await admin
        .from('commissions')
        .select('id, rep_id, commission_amount, bonus_amount, clawback_period_ends_at, created_at')
        .eq('lead_id', linkedLead.id)
        .eq('status', 'pending')
      const approvedIds: string[] = []
      const heldForClawback: string[] = []
      for (const comm of pendingCommissions ?? []) {
        const clawbackEnds = comm.clawback_period_ends_at
          ? new Date(comm.clawback_period_ends_at as string).getTime()
          : new Date(comm.created_at as string).getTime() + 14 * 24 * 60 * 60 * 1000
        if (Date.now() < clawbackEnds) {
          heldForClawback.push(comm.id as string)
          continue
        }
        await admin
          .from('commissions')
          .update({ status: 'approved', approved_at: nowIso })
          .eq('id', comm.id)
        approvedIds.push(comm.id as string)
        if (comm.rep_id) {
          const totalAmount = Number(comm.commission_amount ?? 0) + Number(comm.bonus_amount ?? 0)
          const { data: rep } = await admin
            .from('sales_reps')
            .select('full_name, email')
            .eq('id', comm.rep_id)
            .maybeSingle()
          if (rep?.email) {
            sendEmail({
              to: rep.email,
              subject: `Deal approved — ${linkedLead.business_name} is live`,
              html: dealApprovedEmailHtml({
                repName: rep.full_name ?? 'Rep',
                businessName: linkedLead.business_name,
                amount: totalAmount,
              }),
            }).catch(() => {})
          }
          await admin.from('rep_notifications').insert({
            rep_id: comm.rep_id,
            type: 'commission_updated',
            lead_id: linkedLead.id,
            message: `Commission approved — ${linkedLead.business_name} is live.`,
          })
        }
      }
      // Mirror commission approval onto the lead row for consistency
      // with the legacy /admin/sales-team approval flow.
      if (approvedIds.length > 0) {
        await admin
          .from('leads')
          .update({ approval_status: 'approved', approved_at: nowIso, approved_by: auth.user.id })
          .eq('id', linkedLead.id)
      }
      if (heldForClawback.length > 0) {
        commissionApprovalNote = `Commission held: ${heldForClawback.length} row(s) inside 14-day clawback window. Admin can approve manually once it ends.`
      }
    }
  } catch (e) {
    console.error('[approve-agent] commission approval step failed', e)
    commissionApprovalNote = 'Commission approval step failed — check logs.'
  }

  let ownerEmail: string | null = null
  if (business?.owner_user_id) {
    const { data: owner } = await admin
      .from('users')
      .select('email')
      .eq('id', business.owner_user_id)
      .maybeSingle()
    ownerEmail = owner?.email ?? null
  }

  // Original "You're live" welcome email preserved here (NOT in the lib).
  // Only fires on the clean path; ?override=true skips it because we
  // don't want to tell the client they're live if checks were failing.
  if (ownerEmail && result.phone_number && !override) {
    await sendEmail({
      to: ownerEmail,
      from: 'TalkMate <hello@talkmate.com.au>',
      subject: `You're live: ${business?.name}'s AI receptionist is ready`,
      html: `
        <div style="font-family: 'Outfit', sans-serif; max-width: 560px; margin: 0 auto; background: #061322; color: white; padding: 40px; border-radius: 16px;">
          <div style="margin-bottom: 28px;"><span style="font-size: 28px; font-weight: 800;">Talk</span><span style="font-size: 18px; font-weight: 300; color: #4A9FE8; letter-spacing: 4px;">Mate</span></div>
          <h1 style="font-size: 28px; font-weight: 800; margin-bottom: 12px;">You're live</h1>
          <p style="font-size: 16px; color: rgba(255,255,255,0.7); line-height: 1.7; margin-bottom: 24px;">
            Your AI receptionist for <strong style="color: white;">${business?.name}</strong> has been reviewed and is ready to go.
          </p>
          <div style="background: rgba(232,98,42,0.15); border: 1px solid rgba(232,98,42,0.4); border-radius: 12px; padding: 24px; margin-bottom: 28px;">
            <p style="font-size: 12px; color: #E8622A; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 6px;">Your TalkMate Number</p>
            <p style="font-size: 32px; font-weight: 800; color: white; letter-spacing: 2px; margin: 0;">${result.phone_number}</p>
          </div>
          <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; margin-bottom: 28px;">
            <p style="font-size: 14px; font-weight: 700; color: white; margin-bottom: 12px;">One step to go live:</p>
            <p style="font-size: 14px; color: rgba(255,255,255,0.65); line-height: 1.8; margin: 0;">
              Forward your existing business phone number to <strong style="color: white;">${result.phone_number}</strong>.<br/>
              On most AU phones: dial <strong style="color: #4A9FE8;">**21*${result.phone_number}#</strong> to activate forwarding.<br/>
              Or contact your telco (Telstra/Optus/Vodafone) to set it up.
            </p>
          </div>
          <a href="https://app.talkmate.com.au/dashboard" style="display: inline-block; background: #E8622A; color: white; font-size: 16px; font-weight: 700; padding: 16px 32px; border-radius: 10px; text-decoration: none;">Go to Dashboard</a>
          <p style="font-size: 13px; color: rgba(255,255,255,0.35); margin-top: 28px;">Questions? Reply to this email. We are a real team on the Gold Coast.</p>
        </div>
      `,
    }).catch(console.error)
  }

  await sendAdminTelegram(
    `${business?.name} approved and live. Phone: ${result.phone_number ?? 'manual provisioning needed'}${commissionApprovalNote ? `\n${commissionApprovalNote}` : ''}`,
  ).catch(() => {})

  return NextResponse.json({
    success: true,
    twilioNumber: result.phone_number,
    commission_approval_note: commissionApprovalNote,
  })
}
