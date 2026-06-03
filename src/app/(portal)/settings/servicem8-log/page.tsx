// ServiceM8 push log — Session 3B. Last 50 push attempts for the business.

import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ServiceM8 Push Log · TalkMate' }

interface LogRow {
  id: string
  pushed_at: string
  status: string
  servicem8_job_uuid: string | null
  error_message: string | null
  contact_id: string | null
}

export default async function ServiceM8LogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!business) redirect('/dashboard')

  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('servicem8_push_log')
    .select('id, pushed_at, status, servicem8_job_uuid, error_message, contact_id')
    .eq('business_id', business.id)
    .order('pushed_at', { ascending: false })
    .limit(50)

  // Resolve contact names in one pass.
  const contactIds = Array.from(new Set((rows ?? []).map((r) => r.contact_id).filter(Boolean))) as string[]
  const nameById: Record<string, string> = {}
  if (contactIds.length > 0) {
    const { data: contacts } = await admin.from('contacts').select('id, name').in('id', contactIds)
    for (const c of contacts ?? []) nameById[c.id as string] = (c.name as string | null) ?? ''
  }

  const log = (rows ?? []) as LogRow[]

  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 12, color: '#4A7FBB', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.08)' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#C8D8EA', borderBottom: '1px solid rgba(255,255,255,0.04)', verticalAlign: 'top' }

  function statusColor(s: string): string {
    if (s === 'success') return '#22C55E'
    if (s === 'failed') return '#EF4444'
    return '#FBBF24'
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 980, margin: '0 auto', color: '#F1F5F9', fontFamily: 'Outfit, sans-serif' }}>
      <a href="/settings" style={{ color: '#4A9FE8', fontSize: 13, textDecoration: 'none' }}>← Back to Settings</a>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'white', margin: '12px 0 4px' }}>ServiceM8 Push Log</h1>
      <p style={{ fontSize: 13, color: '#7BAED4', marginTop: 0, marginBottom: 24 }}>The last 50 jobs TalkMate attempted to push to ServiceM8.</p>

      {log.length === 0 ? (
        <div style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 24, fontSize: 14, color: '#7BAED4' }}>
          No jobs pushed yet. When a qualifying call ends, the job will appear here.
        </div>
      ) : (
        <div style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Contact</th>
                <th style={th}>Job UUID</th>
                <th style={th}>Status</th>
                <th style={th}>Error</th>
              </tr>
            </thead>
            <tbody>
              {log.map((r) => (
                <tr key={r.id}>
                  <td style={td}>{new Date(r.pushed_at).toLocaleString('en-AU')}</td>
                  <td style={td}>{(r.contact_id && nameById[r.contact_id]) || '—'}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{r.servicem8_job_uuid ?? '—'}</td>
                  <td style={{ ...td, color: statusColor(r.status), fontWeight: 700 }}>{r.status}</td>
                  <td style={{ ...td, color: '#EF4444', maxWidth: 280, wordBreak: 'break-word' }}>{r.error_message ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
