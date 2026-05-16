import { requireAdmin } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import AdminPagePlaceholder from '@/components/admin/admin-page-placeholder'
import SyncAgentButton from '@/components/portal/sync-agent-button'

export const dynamic = 'force-dynamic'

// Admin view of the AI Voice Agent settings panel. The client portal
// settings page is large and uses dozens of business-id-scoped supabase
// calls client-side, so we render a placeholder with the magic-link
// "Open as client" CTA — plus a quick Sync Agent action so Irfan can
// push agent changes without opening the client view.
export default async function AdminSettingsPage({
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
    .select('vapi_agent_id, agent_last_synced_at')
    .eq('id', clientId)
    .maybeSingle()

  return (
    <div>
      <div style={{ padding: '20px 28px 0', maxWidth: 880, margin: '0 auto' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 12, padding: '14px 16px', borderRadius: 12,
          background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
          marginBottom: 16, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Quick action</div>
            <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 2 }}>Push the latest VIPs, team, and tools into Vapi without opening the client view.</div>
          </div>
          <SyncAgentButton
            hasAgent={!!business?.vapi_agent_id}
            initialLastSyncedAt={business?.agent_last_synced_at ?? null}
            adminClientId={clientId}
          />
        </div>
      </div>
      <AdminPagePlaceholder
        clientId={clientId}
        pageLabel="Agent Settings"
        clientPath="/settings"
        description="Full agent configuration — voice, knowledge base, integrations, and Vapi tools. For full edits, open as the client."
      />
    </div>
  )
}
