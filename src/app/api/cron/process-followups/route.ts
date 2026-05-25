import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/resend'
import { sendAdminTelegram } from '@/lib/notifications'

// Session 41 — follow-up sequence processor.
// Runs hourly at :50. Processes pending lead_followups whose send_at
// has passed. Mark status='sent' BEFORE the side-effect (anti-double-send
// on cron retry). Activity log INSERT lives INSIDE the success branch so
// the activity feed never lies about whether an email actually went out.

interface FollowupRow {
  id: string
  lead_id: string
  rep_id: string
  type: 'email' | 'call_reminder'
  email_subject: string | null
  email_body: string | null
  send_at: string
}

interface LeadRow {
  business_name: string
  contact_name: string | null
  email: string | null
}

interface RepRow {
  full_name: string
  phone: string | null
  notification_email: string | null
}

export async function GET(req: Request) {
  const authResp = verifyCron(req)
  if (authResp) return authResp

  const admin = createAdminClient()
  const { data: pending } = await admin
    .from('lead_followups')
    .select('id, lead_id, rep_id, type, email_subject, email_body, send_at')
    .eq('status', 'pending')
    .lte('send_at', new Date().toISOString())
    .limit(200)

  let processed = 0
  for (const row of (pending ?? []) as FollowupRow[]) {
    const dayLabel = computeDayLabel(row.send_at)

    if (row.type === 'email') {
      const { data: lead } = await admin
        .from('leads')
        .select('business_name, contact_name, email')
        .eq('id', row.lead_id)
        .maybeSingle()
      const { data: rep } = await admin
        .from('sales_reps')
        .select('full_name, phone, notification_email')
        .eq('id', row.rep_id)
        .maybeSingle()

      // Mark sent BEFORE attempting the send so a cron retry doesn't double-send.
      await admin.from('lead_followups')
        .update({ status: 'sent', updated_at: new Date().toISOString() })
        .eq('id', row.id)

      if (!lead?.email || !rep) {
        await admin.from('lead_activities').insert({
          lead_id: row.lead_id,
          rep_id: row.rep_id,
          activity_type: 'system',
          title: `Auto follow-up email skipped on day ${dayLabel}`,
          body: !lead?.email ? 'Lead has no email on file.' : 'Rep details missing.',
        })
        continue
      }

      const html = buildFollowupHtml({ lead, rep, body: row.email_body })
      const subject = (row.email_subject ?? 'Just checking in').replace('{contact_name}', lead.contact_name ?? '')

      const result = await sendEmail({
        from: `TalkMate Sales <${process.env.SALES_EMAIL_FROM ?? 'sales@talkmate.com.au'}>`,
        replyTo: rep.notification_email ?? undefined,
        to: lead.email,
        subject,
        html,
      })

      if (result.ok) {
        await admin.from('lead_activities').insert({
          lead_id: row.lead_id,
          rep_id: row.rep_id,
          activity_type: 'email',
          title: `Auto follow-up email sent on day ${dayLabel}`,
        })
      } else {
        await admin.from('lead_activities').insert({
          lead_id: row.lead_id,
          rep_id: row.rep_id,
          activity_type: 'system',
          title: `Auto follow-up email failed to send on day ${dayLabel}`,
          body: result.error ?? null,
        })
        await sendAdminTelegram(
          `Followup email send failed for ${lead.business_name}: ${result.error ?? 'unknown error'}`,
        ).catch(() => {})
      }
      processed += 1
    } else if (row.type === 'call_reminder') {
      const { data: lead } = await admin
        .from('leads')
        .select('business_name')
        .eq('id', row.lead_id)
        .maybeSingle()

      await admin.from('lead_followups')
        .update({ status: 'sent', updated_at: new Date().toISOString() })
        .eq('id', row.id)

      await admin.from('rep_notifications').insert({
        rep_id: row.rep_id,
        type: 'followup_due',
        lead_id: row.lead_id,
        message: `Follow up with ${lead?.business_name ?? 'lead'} today`,
      })

      processed += 1
    }
  }

  return NextResponse.json({ processed })
}

function computeDayLabel(sendAtIso: string): number {
  // Approx number of days the followup was scheduled for, based on send_at vs created_at.
  // We don't have created_at handy without another fetch — derive from days from now (negative offset).
  // For activity log purposes this is just a human-friendly label.
  const now = Date.now()
  const sendAt = new Date(sendAtIso).getTime()
  const diffDays = Math.max(1, Math.round((now - sendAt) / 86_400_000) + 1)
  return diffDays
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => (
    ch === '&' ? '&amp;' :
    ch === '<' ? '&lt;'  :
    ch === '>' ? '&gt;'  :
    ch === '"' ? '&quot;': '&#39;'
  ))
}

function buildFollowupHtml(opts: { lead: LeadRow; rep: RepRow; body: string | null }) {
  const greeting = `Hi ${escapeHtml(opts.lead.contact_name ?? 'there')},`
  const bodyText = (opts.body ?? 'Wanted to make sure the proposal landed okay. Happy to answer any questions or walk you through how TalkMate would work for your business specifically. Just reply to this email.')
    .replace('{contact_name}', opts.lead.contact_name ?? '')
    .replace('{business_name}', opts.lead.business_name)
  const signoff = [escapeHtml(opts.rep.full_name), opts.rep.phone ? escapeHtml(opts.rep.phone) : null].filter(Boolean).join(' | ')

  return `
  <div style="font-family: 'Outfit', Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #061322;">
    <div style="background: #061322; padding: 22px 28px;">
      <div style="font-size: 22px; font-weight: 800; color: white;">
        Talk<span style="color: #E8622A;">Mate</span>
      </div>
    </div>
    <div style="height: 3px; background: #E8622A;"></div>
    <div style="padding: 28px; background: #ffffff;">
      <p style="font-size: 15px; margin: 0 0 14px;">${greeting}</p>
      <p style="font-size: 15px; line-height: 1.65; margin: 0 0 22px;">${escapeHtml(bodyText)}</p>
      <p style="font-size: 14px; color: #34495e; margin: 0;">${signoff}</p>
    </div>
  </div>`
}
