import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getSmsLabel, formatAuPhone, adminSmsStatus } from '@/lib/sms-labels'

export const dynamic = 'force-dynamic'

interface Row {
  id: string
  to_phone: string | null
  message: string
  sms_type: string | null
  status: string | null
  twilio_sid: string | null
  call_id: string | null
  sent_at: string | null
  error_message: string | null
}

export default async function AdminSmsLogPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/login')
  const { clientId } = await params

  const admin = createAdminClient()
  const { data } = await admin
    .from('sms_log')
    .select('id, to_phone, message, sms_type, status, twilio_sid, call_id, sent_at, error_message')
    .eq('client_id', clientId)
    .order('sent_at', { ascending: false })
    .limit(500)

  const rows = (data ?? []) as Row[]

  return (
    <div style={{ padding: 28, maxWidth: 1300, margin: '0 auto', color: '#F2F6FB' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>SMS Log</h1>
      <p style={{ fontSize: 13, color: '#7BAED4', margin: '6px 0 22px' }}>
        Full unfiltered SMS history for this client. Failed deliveries highlighted in red.
      </p>

      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#071829' }}>
              {['When', 'To', 'Type', 'Status', 'Message', 'Twilio SID', 'Call'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 28, textAlign: 'center', color: '#7BAED4' }}>No SMS sent yet.</td></tr>
            )}
            {rows.map((r, i) => {
              const status = adminSmsStatus(r.status)
              const isFailed = r.status === 'failed' || r.status === 'rejected'
              const label = getSmsLabel(r.sms_type)
              return (
                <tr key={r.id} style={{
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                  background: isFailed
                    ? 'rgba(239,68,68,0.08)'
                    : i % 2 === 0 ? '#0A1E38' : '#071829',
                  verticalAlign: 'top',
                }}>
                  <td style={tdStyle}>{r.sent_at ? new Date(r.sent_at).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                  <td style={tdStyle}>{formatAuPhone(r.to_phone)}</td>
                  <td style={tdStyle}>
                    <div style={{ color: 'white', fontWeight: 500 }}>{label}</div>
                    <div style={{ fontSize: 11, color: '#4A7FBB', fontFamily: 'monospace' }}>{r.sms_type ?? '—'}</div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: status.color, fontWeight: 600 }}>{status.label}</span>
                    {r.error_message && (
                      <div style={{ fontSize: 11, color: '#EF4444', marginTop: 3 }} title={r.error_message}>
                        {r.error_message.slice(0, 80)}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 420 }}>
                    <div style={{ whiteSpace: 'pre-wrap', color: '#C8D8EA', lineHeight: 1.5 }}>{r.message}</div>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11, color: '#7BAED4' }}>
                    {r.twilio_sid ?? '—'}
                  </td>
                  <td style={tdStyle}>
                    {r.call_id ? (
                      <Link href={`/admin/clients/${clientId}/portal/calls`} style={{ color: '#4A9FE8', fontSize: 11, textDecoration: 'underline' }}>
                        View
                      </Link>
                    ) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 700,
  color: '#4A7FBB',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  color: '#C8D8EA',
}
