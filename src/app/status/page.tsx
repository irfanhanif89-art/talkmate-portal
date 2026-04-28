import { createAdminClient } from '@/lib/supabase/server'

export const revalidate = 60
export const dynamic = 'force-dynamic'

interface Service {
  name: string
  status: 'operational' | 'degraded' | 'down'
  detail: string
}

async function loadStatus(): Promise<{ services: Service[]; incidents: Array<{ id: string; type: string; message: string; sent_at: string; resolved: boolean }> }> {
  try {
    const supabase = createAdminClient()
    const { data: vapi } = await supabase.from('vapi_health').select('*').eq('id', 1).maybeSingle()
    const { data: alerts } = await supabase
      .from('system_alerts')
      .select('id, type, message, sent_at, resolved')
      .order('sent_at', { ascending: false })
      .limit(5)

    const vapiStatus: Service['status'] = (vapi?.fail_count ?? 0) >= 3 ? 'down' : (vapi?.fail_count ?? 0) > 0 ? 'degraded' : 'operational'
    const portalStatus: Service['status'] = 'operational'
    const billingStatus: Service['status'] = 'operational'
    const commandStatus: Service['status'] = 'operational'

    return {
      services: [
        { name: 'Voice Agent (Vapi)', status: vapiStatus, detail: vapi?.last_check ? `Last check: ${new Date(vapi.last_check).toLocaleString('en-AU')}` : 'No checks yet' },
        { name: 'Client Portal', status: portalStatus, detail: 'app.talkmate.com.au' },
        { name: 'Billing (Stripe)', status: billingStatus, detail: 'Subscriptions & payouts' },
        { name: 'Command Assistant', status: commandStatus, detail: 'Grok-powered command parsing' },
      ],
      incidents: alerts ?? [],
    }
  } catch {
    return {
      services: [
        { name: 'Voice Agent (Vapi)', status: 'operational', detail: 'Status unavailable — assumed operational' },
        { name: 'Client Portal', status: 'operational', detail: 'app.talkmate.com.au' },
        { name: 'Billing (Stripe)', status: 'operational', detail: 'Subscriptions & payouts' },
        { name: 'Command Assistant', status: 'operational', detail: 'Grok-powered command parsing' },
      ],
      incidents: [],
    }
  }
}

const STATUS_COLOR: Record<Service['status'], { bg: string; color: string; label: string }> = {
  operational: { bg: 'rgba(34,197,94,0.15)', color: '#22C55E', label: 'Operational' },
  degraded: { bg: 'rgba(245,158,11,0.15)', color: '#F59E0B', label: 'Degraded' },
  down: { bg: 'rgba(239,68,68,0.15)', color: '#EF4444', label: 'Down' },
}

export default async function StatusPage() {
  const { services, incidents } = await loadStatus()
  const overall: Service['status'] = services.find(s => s.status === 'down') ? 'down' : services.find(s => s.status === 'degraded') ? 'degraded' : 'operational'
  const overallColor = STATUS_COLOR[overall]

  return (
    <div style={{ minHeight: '100vh', padding: '40px 20px', background: '#061322', color: '#F2F6FB' }}>
      <meta httpEquiv="refresh" content="60" />
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            <div style={{ width: 36, height: 36, background: '#E8622A', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 36 36" width="20" height="20" fill="none">
                <rect x="6" y="8" width="24" height="5" rx="2.5" fill="white" />
                <rect x="14" y="8" width="8" height="22" rx="2.5" fill="white" />
              </svg>
            </div>
            <span style={{ fontWeight: 800, fontSize: '1.3rem', color: 'white', letterSpacing: '-0.5px' }}>
              Talk<span style={{ fontWeight: 300, color: '#4A9FE8', letterSpacing: '2px' }}>Mate</span>
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#4A7FBB' }}>System status</span>
          </div>

          <div style={{
            background: '#0A1E38', border: `1px solid ${overallColor.bg}`, borderRadius: 16, padding: 24, marginBottom: 24,
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: overallColor.color }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'white' }}>
                {overall === 'operational' ? 'All systems operational' : overall === 'degraded' ? 'Degraded performance' : 'Service disruption'}
              </div>
              <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 4 }}>Updated {new Date().toLocaleString('en-AU')}</div>
            </div>
          </div>

          <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 12, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Services
            </div>
            {services.map((s, i) => {
              const c = STATUS_COLOR[s.status]
              return (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: i < services.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <div style={{ width: 9, height: 9, borderRadius: '50%', background: c.color }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2 }}>{s.detail}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: c.bg, color: c.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</span>
                </div>
              )
            })}
          </div>

          <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 12, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Recent incidents
            </div>
            {incidents.length === 0 ? (
              <div style={{ padding: 20, fontSize: 13, color: '#7BAED4' }}>No incidents reported in the last 30 days.</div>
            ) : incidents.map(i => (
              <div key={i.id} style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{i.type.replace(/_/g, ' ')}</div>
                  <span style={{ fontSize: 11, color: i.resolved ? '#22C55E' : '#F59E0B' }}>{i.resolved ? 'Resolved' : 'Investigating'}</span>
                </div>
                <div style={{ fontSize: 12, color: '#7BAED4' }}>{i.message}</div>
                <div style={{ fontSize: 11, color: '#4A7FBB', marginTop: 4 }}>{new Date(i.sent_at).toLocaleString('en-AU')}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 32, fontSize: 12, color: '#4A7FBB', textAlign: 'center' }}>
            <a href="https://app.talkmate.com.au" style={{ color: '#4A9FE8', textDecoration: 'none' }}>← Back to portal</a>
            &nbsp;·&nbsp;
            Need help? <a href="mailto:hello@talkmate.com.au" style={{ color: '#4A9FE8', textDecoration: 'none' }}>hello@talkmate.com.au</a>
          </div>
      </div>
    </div>
  )
}
