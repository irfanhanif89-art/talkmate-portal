import { createAdminClient } from '@/lib/supabase/server'
import SyncAgentButton from '@/components/portal/sync-agent-button'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  const admin = createAdminClient()

  const startOfMonth = new Date()
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0)
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  const [{ data: biz }, { count: callsThisMonth }, { count: callsToday }, { count: vipCount }, { count: teamCount }, { count: catalogCount }] = await Promise.all([
    admin.from('businesses')
      .select('id, name, plan, industry, account_status, vapi_agent_id, agent_last_synced_at, owner_user_id, created_at, onboarding_completed')
      .eq('id', clientId).maybeSingle(),
    admin.from('calls').select('id', { count: 'exact', head: true })
      .eq('business_id', clientId).gte('created_at', startOfMonth.toISOString()),
    admin.from('calls').select('id', { count: 'exact', head: true })
      .eq('business_id', clientId).gte('created_at', todayStart.toISOString()),
    admin.from('vip_callers').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('active', true),
    admin.from('team_members').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('active', true),
    admin.from('catalog_items').select('id', { count: 'exact', head: true })
      .eq('business_id', clientId).eq('active', true),
  ])

  return (
    <div style={{ padding: 28, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: '#7BAED4', margin: '4px 0 0 0' }}>
            Snapshot of {biz?.name ?? clientId} — scoped to this client only.
          </p>
        </div>
        <SyncAgentButton
          hasAgent={!!biz?.vapi_agent_id}
          initialLastSyncedAt={biz?.agent_last_synced_at ?? null}
          adminClientId={clientId}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 22 }}>
        <Stat label="Calls today" value={callsToday ?? 0} />
        <Stat label="Calls this month" value={callsThisMonth ?? 0} />
        <Stat label="Active VIPs" value={vipCount ?? 0} />
        <Stat label="Team members" value={teamCount ?? 0} />
        <Stat label="Active catalog items" value={catalogCount ?? 0} />
      </div>

      <div style={card}>
        <h2 style={cardTitle}>Account snapshot</h2>
        <Row label="Plan" value={biz?.plan ?? '—'} />
        <Row label="Industry" value={biz?.industry ?? '—'} />
        <Row label="Account status" value={biz?.account_status ?? '—'} />
        <Row label="Onboarding complete" value={biz?.onboarding_completed ? 'Yes' : 'No'} />
        <Row label="Vapi agent" value={biz?.vapi_agent_id ?? 'Not provisioned'} />
        <Row label="Last agent sync" value={biz?.agent_last_synced_at ? new Date(biz.agent_last_synced_at).toLocaleString('en-AU') : 'Never'} />
        <Row label="Created" value={biz?.created_at ? new Date(biz.created_at).toLocaleString('en-AU') : '—'} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#4A7FBB', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'white', marginTop: 6 }}>{value}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', fontSize: 13, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ color: '#4A7FBB' }}>{label}</span>
      <span style={{ color: 'white', fontWeight: 600, textAlign: 'right' as const }}>{value}</span>
    </div>
  )
}

const card: React.CSSProperties = {
  background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 14, padding: 22,
}
const cardTitle: React.CSSProperties = {
  fontSize: 14, fontWeight: 800, color: 'white',
  margin: 0, marginBottom: 12,
}
