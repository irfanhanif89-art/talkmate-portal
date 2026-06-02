import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import ResourcesList, { type RepResource } from './resources-list'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Resources — TalkMate Sales HQ' }

export default async function SalesResourcesPage() {
  const auth = await requireSalesRep()
  if (!auth.ok) redirect('/')

  const admin = createAdminClient()

  const { data: resources } = await admin
    .from('sales_resources')
    .select('id, title, description, file_type, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  const ids = (resources ?? []).map(r => r.id)

  // Pull the assignment rows for these resources so we can apply the
  // shared-or-assigned visibility rule. A resource with no rows is shared.
  const { data: assignments } = ids.length
    ? await admin
        .from('sales_resource_assignments')
        .select('resource_id, rep_id')
        .in('resource_id', ids)
    : { data: [] as { resource_id: string; rep_id: string }[] }

  const restricted = new Set<string>()
  const assignedToMe = new Set<string>()
  for (const a of assignments ?? []) {
    restricted.add(a.resource_id)
    if (a.rep_id === auth.rep.id) assignedToMe.add(a.resource_id)
  }

  const visible: RepResource[] = (resources ?? [])
    .filter(r => !restricted.has(r.id) || assignedToMe.has(r.id))
    .map(r => ({ id: r.id, title: r.title, description: r.description, file_type: r.file_type }))

  return (
    <div style={{ padding: '24px 24px 60px', fontFamily: 'Outfit, sans-serif', maxWidth: 860 }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Resources</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, marginTop: 4 }}>
          Reference documents shared by the TalkMate team. Click a resource to open it in a new tab.
        </p>
      </div>

      <ResourcesList resources={visible} />
    </div>
  )
}
