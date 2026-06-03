import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import SmsActivityView, { type SmsActivityRow } from './sms-activity-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'SMS Activity · TalkMate' }

const PLAN_LIMITS: Record<string, number> = {
  starter: 0,
  growth: 200,
  pro: 500,
  professional: 500,
}

const ADMIN_ONLY_TYPES = ['call_intelligence_alert']

export default async function SmsActivityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, plan, sms_used_this_month, sms_reset_at')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (!biz) redirect('/dashboard')

  const business = biz as {
    id: string; plan: string | null;
    sms_used_this_month: number | null; sms_reset_at: string | null;
  }
  const plan = business.plan ?? 'starter'
  const cap = PLAN_LIMITS[plan] ?? 0

  if (cap === 0) {
    // Starter plan landing — informational upsell only. No SMS data shown.
    return (
      <div className="mx-auto max-w-[720px] p-8">
        <h1 className="mb-2 text-[1.5rem] font-[800] text-text">SMS Activity</h1>
        <p className="mb-7 text-[14px] text-dim">Messages sent to your customers by TalkMate.</p>

        <div className="rounded-[16px] border border-[rgba(232,98,42,0.25)] bg-[linear-gradient(135deg,rgba(232,98,42,0.10)_0%,rgba(21,101,192,0.10)_100%)] p-7">
          <div className="mb-2.5 text-[11px] font-[700] uppercase tracking-[0.1em] text-orange">
            SMS not included on Starter
          </div>
          <h2 className="mb-2.5 text-[20px] font-[800] text-text">Unlock automated SMS for your callers</h2>
          <p className="mb-5 text-[14px] leading-[1.6] text-dim">
            Growth and Pro plans include automatic booking confirmations,
            reminders, and missed-call follow-ups sent straight from your
            TalkMate number. No setup required.
          </p>
          <ul className="mb-6 grid list-none gap-2.5 p-0">
            <li className="text-[13px] text-text">✓ Booking confirmations after every call</li>
            <li className="text-[13px] text-text">✓ 24h and 2h reminders before each job</li>
            <li className="text-[13px] text-text">✓ Automatic follow-up on missed calls</li>
            <li className="text-[13px] text-text">✓ 200 messages on Growth, 500 on Pro</li>
          </ul>
          <Link
            href="/billing"
            className="inline-block rounded-[10px] bg-[linear-gradient(135deg,#f58a42,#e86526)] px-6 py-3 text-[14px] font-[600] text-white no-underline shadow-[0_4px_14px_rgba(238,106,44,.35)] hover:brightness-110"
          >
            Upgrade to Growth →
          </Link>
        </div>
      </div>
    )
  }

  // Growth/Pro — pull the full sms_log for this client, filter admin-only
  // types, hand off to the client view for month + bucket filters.
  const { data } = await supabase
    .from('sms_log')
    .select('id, to_phone, message, sms_type, status, sent_at, call_id')
    .eq('client_id', business.id)
    .order('sent_at', { ascending: false })
    .limit(1000)

  const rows: SmsActivityRow[] = (data ?? [])
    .filter(r => !ADMIN_ONLY_TYPES.includes((r as { sms_type: string }).sms_type ?? ''))
    .map(r => {
      const row = r as {
        id: string; to_phone: string | null; message: string;
        sms_type: string | null; status: string | null;
        sent_at: string | null; call_id: string | null;
      }
      return {
        id: row.id,
        to_phone: row.to_phone,
        message: row.message,
        sms_type: row.sms_type,
        status: row.status,
        sent_at: row.sent_at,
        call_id: row.call_id,
      }
    })

  return (
    <SmsActivityView
      rows={rows}
      used={business.sms_used_this_month ?? 0}
      cap={cap}
    />
  )
}
