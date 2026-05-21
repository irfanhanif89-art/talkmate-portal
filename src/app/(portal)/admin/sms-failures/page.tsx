import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getSmsLabel, formatAuPhone } from '@/lib/sms-labels'

export const metadata: Metadata = { title: 'SMS Failures · Admin' }
export const dynamic = 'force-dynamic'

interface FailureRow {
  id: string
  business_id: string
  business_name: string | null
  recipient_phone: string | null
  message_body: string | null
  sms_type: string | null
  status: string | null
  twilio_message_sid: string | null
  call_id: string | null
  error_message: string | null
  created_at: string | null
}

export default async function AdminSmsFailuresPage() {
  // Auth gate — match the pattern used on /admin/clients.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: userProfile } = await supabase.from('users').select('role').eq('id', user.id).single()
  // Set ADMIN_EMAIL in Vercel environment variables
  const isSuperAdmin =
    user.email === process.env.INTERNAL_ALERT_EMAIL ||
    user.email === process.env.ADMIN_EMAIL ||
    user.email === 'hello@talkmate.com.au'
  if (userProfile?.role !== 'admin' && !isSuperAdmin) redirect('/dashboard')

  const admin = createAdminClient()
  const { data } = await admin
    .from('admin_sms_failures')
    .select('*')
    .limit(250)

  const rows = (data ?? []) as FailureRow[]

  return (
    <div style={{ padding: 28, maxWidth: 1300, margin: '0 auto', color: '#F2F6FB' }}>
      <Link href="/admin" style={{ fontSize: 13, color: '#7BAED4', textDecoration: 'none' }}>← Admin</Link>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: '12px 0 4px' }}>SMS Failures</h1>
      <p style={{ fontSize: 13, color: '#7BAED4', margin: '0 0 22px' }}>
        Every Twilio send that returned a failure. Sourced from the
        <code style={{ color: '#4A9FE8', fontFamily: 'monospace', margin: '0 4px' }}>admin_sms_failures</code>
        service-role view.
      </p>

      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#071829' }}>
              {['When', 'Client', 'Recipient', 'Type', 'Twilio SID', 'Reason', 'Message'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 36, textAlign: 'center', color: '#22C55E' }}>
                  No SMS delivery failures. All systems normal.
                </td>
              </tr>
            )}
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(239,68,68,0.05)', verticalAlign: 'top' }}>
                <td style={tdStyle}>{r.created_at ? new Date(r.created_at).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                <td style={{ ...tdStyle, color: 'white' }}>
                  <Link href={`/admin/clients/${r.business_id}/portal/sms-log`} style={{ color: 'white', textDecoration: 'underline' }}>
                    {r.business_name ?? '—'}
                  </Link>
                </td>
                <td style={tdStyle}>{formatAuPhone(r.recipient_phone)}</td>
                <td style={tdStyle}>
                  <div style={{ color: 'white' }}>{getSmsLabel(r.sms_type)}</div>
                  <div style={{ fontSize: 11, color: '#4A7FBB', fontFamily: 'monospace' }}>{r.sms_type ?? '—'}</div>
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11, color: '#7BAED4' }}>{r.twilio_message_sid ?? '—'}</td>
                <td style={{ ...tdStyle, color: '#EF4444', maxWidth: 220 }}>
                  <div style={{ lineHeight: 1.45 }}>{r.error_message ?? '—'}</div>
                </td>
                <td style={{ ...tdStyle, maxWidth: 320, color: '#C8D8EA' }}>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{r.message_body ?? ''}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700,
  color: '#4A7FBB', textTransform: 'uppercase', letterSpacing: '0.06em',
}
const tdStyle: React.CSSProperties = { padding: '10px 14px', color: '#C8D8EA' }
