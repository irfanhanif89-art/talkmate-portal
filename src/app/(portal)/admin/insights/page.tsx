// Session 4B — admin cross-client insight: pending transcript gaps across all
// businesses (read-only). Filterable-by-industry surface that also seeds the
// future cross-industry knowledge base. Admin-gated by the /admin route group.
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const card: React.CSSProperties = {
  background: '#0A1E38',
  border: '1px solid rgba(255,255,255,0.06)',
  padding: 22,
  borderRadius: 12,
  marginBottom: 16,
}

export default async function AdminInsightsPage() {
  const supabase = createAdminClient()

  const { data: gaps } = await supabase
    .from('transcript_gaps')
    .select('id, question, industry, business_id, detected_at')
    .eq('status', 'pending')
    .order('detected_at', { ascending: false })
    .limit(300)

  const rows = gaps ?? []
  const bizIds = Array.from(new Set(rows.map(g => g.business_id as string)))
  const nameById = new Map<string, string>()
  if (bizIds.length) {
    const { data: bizs } = await supabase.from('businesses').select('id, name').in('id', bizIds)
    for (const b of bizs ?? []) nameById.set(b.id as string, (b.name as string | null) ?? 'Unknown')
  }

  // Count by industry for the moat view.
  const byIndustry = new Map<string, number>()
  for (const g of rows) {
    const ind = (g.industry as string | null) ?? 'other'
    byIndustry.set(ind, (byIndustry.get(ind) ?? 0) + 1)
  }

  return (
    <div style={{ padding: 24, color: 'white' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>Agent Insights (all clients)</h1>
      <p style={{ color: '#7BAED4', fontSize: 13, margin: '0 0 16px' }}>
        Pending unanswered questions across every business. Common questions within an industry are candidates for a shared knowledge pack.
      </p>

      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>By industry</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {Array.from(byIndustry.entries()).sort((a, b) => b[1] - a[1]).map(([ind, n]) => (
            <span key={ind} style={{ background: 'rgba(232,98,42,0.14)', color: '#E8622A', padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>
              {ind}: {n}
            </span>
          ))}
          {byIndustry.size === 0 && <span style={{ color: '#7BAED4', fontSize: 13 }}>No pending gaps.</span>}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Pending questions ({rows.length})</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#7BAED4' }}>
              <th style={{ padding: '6px 8px' }}>Business</th>
              <th style={{ padding: '6px 8px' }}>Industry</th>
              <th style={{ padding: '6px 8px' }}>Question</th>
              <th style={{ padding: '6px 8px' }}>Detected</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(g => (
              <tr key={g.id as string} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <td style={{ padding: '6px 8px' }}>{nameById.get(g.business_id as string) ?? 'Unknown'}</td>
                <td style={{ padding: '6px 8px', textTransform: 'capitalize', color: '#7BAED4' }}>{(g.industry as string | null) ?? 'other'}</td>
                <td style={{ padding: '6px 8px' }}>{g.question as string}</td>
                <td style={{ padding: '6px 8px', color: '#7BAED4' }}>{new Date(g.detected_at as string).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
