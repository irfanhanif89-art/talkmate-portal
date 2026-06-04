// Session 4B — monthly performance report email.
// ROI figures come from src/lib/roi.ts (computeRoiForBusiness). The headline
// is framed as an honest estimate with a one-line methodology note — never a
// bare "$X recovered". No em dashes in copy.
import type { RoiSummary } from '@/lib/roi'

const ORANGE = '#E8622A'
const NAVY = '#061322'

export interface MonthlyReportParams {
  businessName: string
  agentName: string
  ownerName: string | null
  month: string
  roi: RoiSummary
  topGaps: string[]
  flaggedCount: number
}

function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-AU')
}

function statRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;color:#5b6b7c;font-size:14px;">${label}</td>
    <td style="padding:8px 0;color:${NAVY};font-size:14px;font-weight:700;text-align:right;">${value}</td>
  </tr>`
}

export function buildMonthlyReportEmail(p: MonthlyReportParams): { subject: string; html: string } {
  const greetingName = p.ownerName ? `, ${p.ownerName}` : ''
  const gapsBlock = p.topGaps.length > 0
    ? `<div style="margin-top:24px;">
         <div style="font-size:15px;font-weight:700;color:${NAVY};">Top unanswered questions</div>
         <ul style="margin:8px 0 0;padding-left:18px;color:#5b6b7c;font-size:14px;line-height:1.6;">
           ${p.topGaps.map(q => `<li>${q}</li>`).join('')}
         </ul>
         <a href="https://app.talkmate.com.au/insights" style="display:inline-block;margin-top:8px;color:${ORANGE};font-size:13px;font-weight:600;text-decoration:none;">Add these to your knowledge base &rarr;</a>
       </div>`
    : ''

  const flaggedBlock = p.flaggedCount > 0
    ? `<div style="margin-top:16px;padding:12px 14px;background:#fff7ed;border-radius:8px;color:#9a3412;font-size:14px;">
         ${p.flaggedCount} call${p.flaggedCount === 1 ? '' : 's'} flagged for a closer look this month. Review them in your portal.
       </div>`
    : ''

  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:${NAVY};border-radius:12px 12px 0 0;padding:24px;text-align:center;">
      <div style="color:#fff;font-size:20px;font-weight:800;">TalkMate</div>
      <div style="color:#9fb6cc;font-size:13px;margin-top:4px;">Monthly performance report</div>
    </div>
    <div style="background:#fff;border-radius:0 0 12px 12px;padding:24px;">
      <p style="color:${NAVY};font-size:16px;margin:0 0 4px;">Here is how ${p.agentName} performed in ${p.month}${greetingName}.</p>

      <div style="margin:20px 0;padding:20px;background:#f0fdf4;border-radius:10px;text-align:center;">
        <div style="color:#15803d;font-size:13px;font-weight:600;">Estimated value recovered</div>
        <div style="color:#166534;font-size:34px;font-weight:800;margin-top:4px;">${money(p.roi.totalEstimatedRevenue)}</div>
        <div style="color:#5b6b7c;font-size:11px;margin-top:6px;">An estimate based on after-hours calls, win-backs and chat leads handled, using your average job value. See your dashboard for how we calculate this.</div>
      </div>

      <table style="width:100%;border-collapse:collapse;">
        ${statRow('Calls handled', String(p.roi.totalCallsAnswered))}
        ${statRow('After-hours calls', String(p.roi.callsAfterHours.count))}
        ${statRow('Win-backs sent', String(p.roi.winbacksSent.count))}
        ${statRow('Review requests sent', String(p.roi.reviewRequestsSent.count))}
        ${statRow('Chat leads captured', String(p.roi.chatLeads.count))}
      </table>

      ${flaggedBlock}
      ${gapsBlock}

      <div style="margin-top:24px;text-align:center;">
        <a href="https://app.talkmate.com.au/dashboard" style="display:inline-block;background:${ORANGE};color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:8px;">View full report</a>
      </div>

      <p style="color:#9aa7b4;font-size:11px;margin-top:24px;text-align:center;">To stop these reports, go to Settings then Automation and turn off the monthly summary.</p>
    </div>
  </div></body></html>`

  return { subject: `${p.agentName}'s Monthly Report for ${p.month}`, html }
}
