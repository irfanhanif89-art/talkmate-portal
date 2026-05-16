import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import TeamView from '@/app/(portal)/team/team-view'

export const dynamic = 'force-dynamic'

export default async function AdminTeamPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/login')

  const { clientId } = await params
  const admin = createAdminClient()
  const { data: business } = await admin
    .from('businesses')
    .select('id, plan, call_transfer_enabled, vapi_agent_id, agent_last_synced_at')
    .eq('id', clientId)
    .maybeSingle()
  if (!business) redirect('/admin/clients')

  return (
    <div style={{ padding: 28, maxWidth: 1200, margin: '0 auto', color: '#F2F6FB' }}>
      <TeamView
        plan={business.plan ?? 'starter'}
        transferEnabled={!!business.call_transfer_enabled}
        hasAgent={!!business.vapi_agent_id}
        initialLastSyncedAt={business.agent_last_synced_at ?? null}
        adminClientId={clientId}
      />
    </div>
  )
}
