import { createClient, createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { redirect } from 'next/navigation'
import { formatDate } from '@/lib/sales-format'

export const dynamic = 'force-dynamic'

interface ClientRow {
  business_id: string
  business_name: string
  plan: string | null
  account_status: string | null
  created_at: string
  calls_this_month: number
}

export default async function SalesClientsPage() {
  const auth = await requireSalesRep()
  if (!auth.ok) redirect('/')

  const supabase = await createClient()
  const { data: leads } = await supabase
    .from('leads')
    .select('business_id, business_name, created_at')
    .eq('assigned_to', auth.rep.id)
    .not('business_id', 'is', null)
    .order('created_at', { ascending: false })

  const businessIds = (leads ?? []).map(l => l.business_id).filter(Boolean) as string[]

  // Reps don't have RLS access to businesses (they're a different
  // tenant boundary). Use service-role to fetch plan/status/onboard
  // date for their own clients only.
  let clients: ClientRow[] = []
  if (businessIds.length > 0) {
    const admin = createAdminClient()
    const startOfMonth = new Date()
    startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)

    const [{ data: businesses }, callCounts] = await Promise.all([
      admin.from('businesses')
        .select('id, name, plan, account_status, created_at')
        .in('id', businessIds),
      Promise.all(businessIds.map(async id => {
        const { count } = await admin.from('calls')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', id)
          .gte('created_at', startOfMonth.toISOString())
        return [id, count ?? 0] as const
      })),
    ])

    const callMap = new Map(callCounts)
    const bizMap = new Map((businesses ?? []).map(b => [b.id, b]))
    clients = businessIds.map(id => {
      const biz = bizMap.get(id)
      const lead = leads?.find(l => l.business_id === id)
      return {
        business_id: id,
        business_name: biz?.name ?? lead?.business_name ?? 'Unknown',
        plan: biz?.plan ?? null,
        account_status: biz?.account_status ?? null,
        created_at: biz?.created_at ?? lead?.created_at ?? new Date().toISOString(),
        calls_this_month: callMap.get(id) ?? 0,
      }
    })
  }

  return (
    <div style={{ padding: '24px 24px 40px', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>My clients</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, marginTop: 4 }}>
          Businesses you've onboarded. Read-only view of plan, status, and monthly call volume.
        </p>
      </div>

      {clients.length === 0 ? (
        <div style={{
          padding: 36, borderRadius: 12,
          background: '#0A1E38', border: '1px dashed rgba(255,255,255,0.1)',
          textAlign: 'center', fontSize: 13, color: '#7BAED4',
        }}>
          No clients onboarded yet. Once you close and onboard a deal, the client will show up here.
        </div>
      ) : (
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', color: '#4A7FBB', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <th style={th}>Business</th>
                  <th style={th}>Plan</th>
                  <th style={th}>Status</th>
                  <th style={th}>Calls this month</th>
                  <th style={th}>Onboarded</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.business_id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={td}><strong style={{ color: 'white' }}>{c.business_name}</strong></td>
                    <td style={{ ...td, color: '#7BAED4', textTransform: 'capitalize' }}>{c.plan ?? '—'}</td>
                    <td style={td}>
                      <StatusPill status={c.account_status} />
                    </td>
                    <td style={{ ...td, color: '#E8622A', fontWeight: 700 }}>{c.calls_this_month.toLocaleString()}</td>
                    <td style={{ ...td, color: '#7BAED4' }}>{formatDate(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: string | null }) {
  const map: Record<string, { color: string; bg: string; border: string; label: string }> = {
    active:          { color: '#22c55e', bg: 'rgba(34,197,94,0.15)',  border: 'rgba(34,197,94,0.35)', label: 'Active' },
    trial:           { color: '#4A9FE8', bg: 'rgba(74,159,232,0.15)', border: 'rgba(74,159,232,0.35)', label: 'Trial' },
    pending:         { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.35)', label: 'Pending' },
    pending_payment: { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.35)', label: 'Pending payment' },
    suspended:       { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  label: 'Suspended' },
    cancelled:       { color: '#94a3b8', bg: 'rgba(100,116,139,0.18)', border: 'rgba(100,116,139,0.4)', label: 'Cancelled' },
    expired:         { color: '#94a3b8', bg: 'rgba(100,116,139,0.18)', border: 'rgba(100,116,139,0.4)', label: 'Expired' },
  }
  const sty = (status && map[status]) ?? { color: '#7BAED4', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', label: status ?? 'Unknown' }
  return (
    <span style={{
      display: 'inline-block', padding: '3px 9px', borderRadius: 99,
      background: sty.bg, color: sty.color, border: `1px solid ${sty.border}`,
      fontSize: 11, fontWeight: 700,
    }}>{sty.label}</span>
  )
}

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left' }
const td: React.CSSProperties = { padding: '12px', verticalAlign: 'middle' }
