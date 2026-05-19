import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface CallFlag { type: string; detail?: string }

interface CallRow {
  id: string
  caller_number: string | null
  caller_name: string | null
  duration_seconds: number | null
  outcome: string | null
  summary: string | null
  created_at: string
  intelligence_status: 'resolved' | 'review' | 'critical' | 'pending' | 'error' | null
  intelligence_score: number | null
  intelligence_summary: string | null
  intelligence_flags: CallFlag[] | null
  owner_alerted: boolean | null
}

const FLAG_LABELS: Record<string, string> = {
  short_call: 'Short call',
  vip_not_transferred: 'VIP not transferred',
  agent_promise: 'Agent promised follow-up',
  caller_frustrated: 'Caller frustrated',
  missed_lead: 'Missed lead',
  warm_lead: 'Warm lead',
  agent_error: 'Agent error',
  no_resolution: 'No resolution',
}

function dotFor(status: CallRow['intelligence_status']): { color: string; tooltip: string } | null {
  switch (status) {
    case 'resolved': return { color: '#22C55E', tooltip: 'Resolved' }
    case 'review':   return { color: '#F59E0B', tooltip: 'Worth reviewing' }
    case 'critical': return { color: '#EF4444', tooltip: 'Needs attention' }
    case 'pending':  return { color: 'rgba(255,255,255,0.25)', tooltip: 'Analysing' }
    case 'error':    return { color: 'rgba(255,255,255,0.15)', tooltip: 'Scoring failed' }
    default: return null
  }
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
    .select('id, caller_number, caller_name, duration_seconds, outcome, summary, created_at, intelligence_status, intelligence_score, intelligence_summary, intelligence_flags, owner_alerted')
    .eq('business_id', clientId)
    .order('created_at', { ascending: false })
    .limit(100)
  const rows = (data ?? []) as CallRow[]

  return (
    <div style={{ padding: 28, maxWidth: 1200, margin: '0 auto', color: '#F2F6FB' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>Calls</h1>
      <p style={{ fontSize: 13, color: '#7BAED4', margin: '6px 0 22px' }}>Last 100 calls for this client (read-only). Intelligence dots show agent quality.</p>

      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#071829' }}>
              {['', 'When', 'Caller', 'Phone', 'Duration', 'Outcome', 'Score', 'Summary'].map(h => (
                <th key={h} style={{
                  textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700,
                  color: '#4A7FBB', textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 28, textAlign: 'center', color: '#7BAED4' }}>No calls yet.</td></tr>
            )}
            {rows.map((c, i) => {
              const dot = dotFor(c.intelligence_status)
              const flags = Array.isArray(c.intelligence_flags) ? c.intelligence_flags : []
              const summaryText = c.intelligence_summary ?? c.summary ?? '—'
              return (
                <tr key={c.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? '#0A1E38' : '#071829', verticalAlign: 'top' }}>
                  <td style={{ padding: '12px 14px', width: 30 }}>
                    {dot ? (
                      <div title={dot.tooltip} style={{ width: 10, height: 10, borderRadius: '50%', background: dot.color, boxShadow: `0 0 0 3px ${dot.color}22` }} />
                    ) : <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#C8D8EA' }}>{new Date(c.created_at).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td style={{ padding: '10px 14px', color: 'white' }}>{c.caller_name ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: '#7BAED4' }}>{c.caller_number ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: '#C8D8EA' }}>{c.duration_seconds != null ? `${Math.round((c.duration_seconds || 0) / 60)}m` : '—'}</td>
                  <td style={{ padding: '10px 14px', color: '#C8D8EA' }}>{c.outcome ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: c.intelligence_score != null ? 'white' : 'rgba(255,255,255,0.3)', fontWeight: 600 }}>
                    {c.intelligence_score != null ? `${c.intelligence_score}/10` : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#7BAED4', maxWidth: 380 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={summaryText}>{summaryText}</div>
                    {flags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                        {flags.map((f, j) => (
                          <span key={j} title={f.detail ?? ''} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'rgba(245,158,11,0.14)', color: '#F59E0B', fontWeight: 600 }}>
                            {FLAG_LABELS[f.type] ?? f.type}
                          </span>
                        ))}
                      </div>
                    )}
                    {c.owner_alerted && (
                      <div style={{ fontSize: 10, color: '#22C55E', marginTop: 4 }}>✓ Owner alerted via SMS</div>
                    )}
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
