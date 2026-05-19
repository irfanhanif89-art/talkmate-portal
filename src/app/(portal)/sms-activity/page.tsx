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
      <div style={{ padding: 32, maxWidth: 720, margin: '0 auto', color: '#F2F6FB' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white', marginBottom: 8 }}>SMS Activity</h1>
        <p style={{ fontSize: 14, color: '#7BAED4', marginBottom: 28 }}>Messages sent to your customers by TalkMate.</p>

        <div style={{
          background: 'linear-gradient(135deg, rgba(232,98,42,0.10) 0%, rgba(21,101,192,0.10) 100%)',
          border: '1px solid rgba(232,98,42,0.25)',
          borderRadius: 16, padding: 28,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#E8622A', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>SMS not included on Starter</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', marginBottom: 10 }}>Unlock automated SMS for your callers</h2>
          <p style={{ fontSize: 14, color: '#7BAED4', lineHeight: 1.6, marginBottom: 20 }}>
            Growth and Pro plans include automatic booking confirmations,
            reminders, and missed-call follow-ups sent straight from your
            TalkMate number. No setup required.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'grid', gap: 10 }}>
            <li style={{ fontSize: 13, color: '#C8D8EA' }}>✓ Booking confirmations after every call</li>
            <li style={{ fontSize: 13, color: '#C8D8EA' }}>✓ 24h and 2h reminders before each job</li>
            <li style={{ fontSize: 13, color: '#C8D8EA' }}>✓ Automatic follow-up on missed calls</li>
            <li style={{ fontSize: 13, color: '#C8D8EA' }}>✓ 200 messages on Growth, 500 on Pro</li>
          </ul>
          <Link href="/billing" style={{
            display: 'inline-block', background: '#E8622A', color: 'white',
            padding: '12px 24px', borderRadius: 10, fontSize: 14, fontWeight: 600,
            textDecoration: 'none',
          }}>
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
