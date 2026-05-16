import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import CatalogPage from '@/app/(portal)/catalog/page'

export const dynamic = 'force-dynamic'

export default async function AdminCatalogPage({
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
    .select('id, vapi_agent_id, agent_last_synced_at')
    .eq('id', clientId)
    .maybeSingle()
  if (!business) redirect('/admin/clients')

  return (
    <CatalogPage
      adminClientId={clientId}
      adminBusinessId={business.id}
      adminHasAgent={!!business.vapi_agent_id}
      adminLastSyncedAt={business.agent_last_synced_at ?? null}
    />
  )
}
