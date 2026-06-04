// Session 4B — weekly sales intel digest for the sales team.
// Runs Monday 08:00 AEST (vercel.json: "0 22 * * 0"). No AI cost: lightweight
// phrase extraction over the last 7 days of call transcripts, grouped by industry.
import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const QUESTION_STARTERS = ['how much', 'do you', 'can you', 'what time', 'how long', 'are you', 'how quickly', 'when can']
const BOOKING_SIGNALS = ['sounds good', 'yes please', 'book it', "let's do it", 'lets do it', 'go ahead', 'come now']
const HANGUP_SIGNALS = ['never mind', 'nevermind', 'try someone else', "i'll call back", 'forget it', 'no thanks']

function customerLines(transcript: string): string[] {
  // Transcripts are line-delimited "Role: text". Keep caller/user/customer lines.
  return transcript.split(/\r?\n/)
    .filter(l => /^(user|customer|caller)\s*:/i.test(l))
    .map(l => l.replace(/^[^:]*:\s*/, '').trim())
    .filter(Boolean)
}

function pickMatches(lines: string[], needles: string[], cap = 5): string[] {
  const out: string[] = []
  for (const l of lines) {
    const low = l.toLowerCase()
    if (needles.some(n => low.includes(n)) && !out.includes(l)) out.push(l.slice(0, 120))
    if (out.length >= cap) break
  }
  return out
}

export async function GET(req: Request) {
  const denied = verifyCron(req)
  if (denied) return denied

  const admin = createAdminClient()
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Industry map.
  const { data: bizRows } = await admin.from('businesses').select('id, industry').limit(1000)
  const industryOf = new Map<string, string>()
  for (const b of bizRows ?? []) industryOf.set(b.id as string, (b.industry as string | null) ?? 'other')

  // Last 7d calls with a transcript.
  const { data: calls } = await admin
    .from('calls')
    .select('business_id, transcript, outcome, was_abandoned, duration_seconds')
    .gte('created_at', sinceIso)
    .not('transcript', 'is', null)
    .limit(2000)

  interface Bucket { count: number; questions: string[]; bookings: string[]; hangups: string[] }
  const byIndustry = new Map<string, Bucket>()
  for (const c of calls ?? []) {
    const ind = industryOf.get(c.business_id as string) ?? 'other'
    const bucket = byIndustry.get(ind) ?? { count: 0, questions: [], bookings: [], hangups: [] }
    bucket.count++
    const lines = customerLines((c.transcript as string) ?? '')
    if (bucket.questions.length < 8) bucket.questions.push(...pickMatches(lines, QUESTION_STARTERS, 8 - bucket.questions.length))
    if ((c.outcome === 'booked') || c.outcome === 'booking_made') {
      if (bucket.bookings.length < 5) bucket.bookings.push(...pickMatches(lines, BOOKING_SIGNALS, 5 - bucket.bookings.length))
    }
    if (c.was_abandoned || (Number(c.duration_seconds ?? 0) < 30)) {
      if (bucket.hangups.length < 5) bucket.hangups.push(...pickMatches(lines, HANGUP_SIGNALS, 5 - bucket.hangups.length))
    }
    byIndustry.set(ind, bucket)
  }

  const totalAnalysed = (calls ?? []).length
  if (totalAnalysed === 0) {
    return NextResponse.json({ ok: true, status: 'no_calls' })
  }

  // Recipients: active reps with a notification email.
  const { data: reps } = await admin
    .from('sales_reps')
    .select('notification_email')
    .eq('status', 'active')
    .not('notification_email', 'is', null)
  const recipients = Array.from(new Set((reps ?? []).map(r => String(r.notification_email).trim()).filter(Boolean)))
  if (recipients.length === 0) return NextResponse.json({ ok: true, status: 'no_recipients', totalAnalysed })

  const weekOf = new Date(Date.parse(sinceIso)).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  const sections = Array.from(byIndustry.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([ind, b]) => {
      const list = (title: string, items: string[]) => items.length
        ? `<div style="margin-top:8px;"><div style="font-size:13px;font-weight:700;color:#061322;">${title}</div><ul style="margin:4px 0 0;padding-left:18px;color:#5b6b7c;font-size:13px;line-height:1.5;">${items.map(i => `<li>${i.replace(/</g, '&lt;')}</li>`).join('')}</ul></div>`
        : ''
      return `<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e6eaee;">
        <div style="font-size:15px;font-weight:800;color:#061322;text-transform:capitalize;">${ind} (${b.count} calls)</div>
        ${list('Common questions', b.questions.slice(0, 6))}
        ${list('Booking phrases', b.bookings.slice(0, 4))}
        ${list('Drop-off phrases', b.hangups.slice(0, 4))}
      </div>`
    }).join('')

  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:#061322;border-radius:12px 12px 0 0;padding:20px;text-align:center;color:#fff;">
        <div style="font-size:18px;font-weight:800;">TalkMate Sales Intel</div>
        <div style="color:#9fb6cc;font-size:13px;margin-top:4px;">Week of ${weekOf} · ${totalAnalysed} calls analysed</div>
      </div>
      <div style="background:#fff;border-radius:0 0 12px 12px;padding:24px;">
        <p style="color:#5b6b7c;font-size:14px;margin:0;">What customers are actually saying on calls this week, by industry. Use it for prospecting angles and objection handling.</p>
        ${sections}
      </div>
    </div></body></html>`

  const res = await sendEmail({
    to: recipients,
    subject: `TalkMate Sales Intel for week of ${weekOf}`,
    html,
    from: process.env.SALES_EMAIL_FROM || 'TalkMate <hello@talkmate.com.au>',
    tag: 'sales_transcript_digest',
  })

  return NextResponse.json({ ok: true, totalAnalysed, recipients: recipients.length, sent: res.success })
}
