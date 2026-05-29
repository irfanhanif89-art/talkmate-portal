import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const card: React.CSSProperties = {
  background: '#0A1E38',
  border: '1px solid rgba(255,255,255,0.06)',
  padding: 22,
  borderRadius: 12,
  marginBottom: 16,
}

const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  margin: '0 0 12px',
}

export default async function DemoAccountsPage() {
  const supabase = createAdminClient()

  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, industry, business_type, plan, created_at, owner_user_id')
    .eq('is_demo', true)
    .order('created_at', { ascending: false })

  const bizList = businesses ?? []

  // Fetch call + booking counts for each demo business in parallel
  const counts = await Promise.all(
    bizList.map(async (biz) => {
      const [callRes, bookingRes] = await Promise.all([
        supabase
          .from('calls')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', biz.id),
        supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', biz.id),
      ])
      return {
        id: biz.id,
        calls_count: callRes.count ?? 0,
        bookings_count: bookingRes.count ?? 0,
      }
    }),
  )

  const countMap = new Map(counts.map((c) => [c.id, c]))

  const demoPortalToken = process.env.NEXT_PUBLIC_DEMO_PORTAL_TOKEN ?? ''

  return (
    <div style={{ padding: 24, fontFamily: 'Outfit, sans-serif', color: 'white', background: '#061322', minHeight: '100vh' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 6px' }}>Demo Accounts</h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', margin: 0, fontSize: 14 }}>
          Internal demo businesses used for sales pitches. Hidden from /admin/clients.
        </p>
      </div>

      {bizList.length === 0 && (
        <div style={card}>
          <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0 }}>No demo businesses found.</p>
        </div>
      )}

      {bizList.map((biz) => {
        const c = countMap.get(biz.id)
        const industry = biz.industry ?? biz.business_type ?? 'unknown'
        const demoUrl = `/sales-demo/${industry}?token=${demoPortalToken}`
        const impersonateUrl = `/api/admin/clients/${biz.id}/impersonate?redirect=1`

        return (
          <div key={biz.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{biz.name}</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                    background: 'rgba(232,98,42,0.15)', color: '#E8622A',
                    border: '1px solid rgba(232,98,42,0.3)',
                    textTransform: 'capitalize',
                  }}>
                    {industry}
                  </span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                    {c?.calls_count ?? 0} calls
                  </span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                    {c?.bookings_count ?? 0} bookings
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                <a
                  href={demoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    background: '#E8622A',
                    color: 'white',
                    border: 'none',
                    padding: '9px 16px',
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: 13,
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Open Demo Portal
                </a>
                <a
                  href={impersonateUrl}
                  style={{
                    display: 'inline-block',
                    background: 'transparent',
                    color: 'white',
                    border: '1px solid rgba(255,255,255,0.2)',
                    padding: '9px 16px',
                    borderRadius: 8,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'Outfit, sans-serif',
                    fontSize: 13,
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Impersonate
                </a>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
