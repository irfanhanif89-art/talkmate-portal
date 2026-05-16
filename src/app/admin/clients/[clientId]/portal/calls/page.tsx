import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface CallRow {
  id: string
  caller_phone: string | null
  caller_name: string | null
  duration_seconds: number | null
  outcome: string | null
  summary: string | null
  created_at: string
}

export default async function AdminCallsPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/login')

  const { clientId } = await params
  const admin = createAdminClient()
  const { data } = await admin
    .from('calls')
    .select('id, caller_phone, caller_name, duration_seconds, outcome, summary, created_at')
    .eq('business_id', clientId)
    .order('created_at', { ascending: false })
    .limit(100)
  const rows = (data ?? []) as CallRow[]

  return (
    <div style={{ padding: 28, maxWidth: 1200, margin: '0 auto', color: '#F2F6FB' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>Calls</h1>
      <p style={{ fontSize: 13, color: '#7BAED4', margin: '6px 0 22px' }}>Last 100 calls for this client (read-only).</p>

      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#071829' }}>
              {['When', 'Caller', 'Phone', 'Duration', 'Outcome', 'Summary'].map(h => (
                <th key={h} style={{
                  textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700,
                  color: '#4A7FBB', textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', color: '#7BAED4' }}>No calls yet.</td></tr>
            )}
            {rows.map((c, i) => (
              <tr key={c.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? '#0A1E38' : '#071829' }}>
                <td style={{ padding: '10px 14px', color: '#C8D8EA' }}>{new Date(c.created_at).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td style={{ padding: '10px 14px', color: 'white' }}>{c.caller_name ?? '—'}</td>
                <td style={{ padding: '10px 14px', color: '#7BAED4' }}>{c.caller_phone ?? '—'}</td>
                <td style={{ padding: '10px 14px', color: '#C8D8EA' }}>{c.duration_seconds != null ? `${Math.round((c.duration_seconds || 0) / 60)}m` : '—'}</td>
                <td style={{ padding: '10px 14px', color: '#C8D8EA' }}>{c.outcome ?? '—'}</td>
                <td style={{ padding: '10px 14px', color: '#7BAED4', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.summary ?? ''}>{c.summary ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
