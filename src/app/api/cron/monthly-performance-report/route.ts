// Session 4B — monthly agent performance report.
// Runs 1st of month 09:00 AEST (vercel.json: "0 23 1 * *").
// Sends each active business owner (+ billing contact, if set and enabled) an
// estimated-value summary for the previous calendar month. ROI from roi.ts.
import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { computeRoiForBusiness } from '@/lib/roi'
import { sendEmail } from '@/lib/email'
import { buildMonthlyReportEmail } from '@/lib/email-templates/monthly-report'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const denied = verifyCron(req)
  if (denied) return denied

  const admin = createAdminClient()
  const now = new Date()
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const startIso = lastMonthStart.toISOString()
  const endIso = thisMonthStart.toISOString()
  const monthLabel = lastMonthStart.toLocaleString('en-AU', { month: 'long', year: 'numeric' })

  const { data: businesses } = await admin
    .from('businesses')
    .select('id, name, agent_name, owner_name, owner_user_id, billing_contact_email, monthly_summary_enabled, last_monthly_summary_sent_at')
    .in('account_status', ['active', 'trial'])
    .limit(500)

  let sent = 0, skipped = 0, failed = 0

  for (const b of businesses ?? []) {
    try {
      if (b.monthly_summary_enabled === false) { skipped++; continue }
      // Dedup: already sent for this month's run.
      if (b.last_monthly_summary_sent_at && new Date(b.last_monthly_summary_sent_at) >= thisMonthStart) {
        skipped++; continue
      }

      // Owner email via auth.users.
      let ownerEmail = ''
      if (b.owner_user_id) {
        const { data: u } = await admin.auth.admin.getUserById(b.owner_user_id as string)
        ownerEmail = u?.user?.email ?? ''
      }
      const recipients = [ownerEmail, (b.billing_contact_email as string | null) ?? '']
        .map(e => e.trim()).filter(Boolean)
      if (recipients.length === 0) { skipped++; continue }

      const roi = await computeRoiForBusiness(admin, b.id as string, 'last_month', now)

      // Top 3 distinct unanswered questions from last month.
      const { data: gapRows } = await admin
        .from('transcript_gaps')
        .select('question')
        .eq('business_id', b.id)
        .gte('detected_at', startIso)
        .lt('detected_at', endIso)
        .limit(50)
      const topGaps: string[] = []
      for (const g of gapRows ?? []) {
        const q = String(g.question).trim()
        if (q && !topGaps.includes(q)) topGaps.push(q)
        if (topGaps.length >= 3) break
      }

      // Flagged-for-review calls last month.
      const { count: flaggedCount } = await admin
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', b.id)
        .gte('needs_review_at', startIso)
        .lt('needs_review_at', endIso)

      const { subject, html } = buildMonthlyReportEmail({
        businessName: (b.name as string | null) ?? 'your business',
        agentName: (b.agent_name as string | null) || 'Your TalkMate agent',
        ownerName: (b.owner_name as string | null) ?? null,
        month: monthLabel,
        roi,
        topGaps,
        flaggedCount: flaggedCount ?? 0,
      })

      const res = await sendEmail({
        to: recipients,
        subject,
        html,
        from: 'TalkMate <hello@talkmate.com.au>',
        tag: 'monthly_performance_report',
      })
      if (res.success) {
        sent++
        await admin.from('businesses')
          .update({ last_monthly_summary_sent_at: new Date().toISOString() })
          .eq('id', b.id)
      } else {
        failed++
        console.error('[monthly-report] send failed', { businessId: b.id, reason: res.reason })
      }
    } catch (e) {
      failed++
      console.error('[monthly-report] error', { businessId: b.id, error: (e as Error).message })
    }
  }

  return NextResponse.json({ ok: true, month: monthLabel, sent, skipped, failed })
}
