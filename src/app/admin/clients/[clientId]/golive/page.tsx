import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { computeAutoChecks } from '@/lib/golive-checks'
import GoLiveChecklistView from './golive-view'

export const dynamic = 'force-dynamic'

interface ChecklistRow {
  business_id: string
  verified_at: string | null
  verified_by: string | null
  notes: string | null
  updated_at: string
  [key: string]: unknown
}

export default async function GoLivePage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/login')

  const { clientId } = await params
  const admin = createAdminClient()

  // Compute auto checks fresh, upsert, then re-read the row so the
  // client component starts with a fully-current snapshot.
  const { business, result: autoResult } = await computeAutoChecks(admin, clientId)
  if (!business) {
    return (
      <div style={{ padding: 32, color: '#F2F6FB' }}>
        <p style={{ color: '#EF4444' }}>Business not found.</p>
        <Link href="/admin/clients" style={{ color: '#4A9FE8' }}>← Back to clients</Link>
      </div>
    )
  }

  await admin
    .from('client_golive_checklist')
    .upsert(
      { business_id: clientId, updated_at: new Date().toISOString(), ...autoResult },
      { onConflict: 'business_id' },
    )

  const { data: row } = await admin
    .from('client_golive_checklist')
    .select('*')
    .eq('business_id', clientId)
    .maybeSingle()

  const checklist = (row as ChecklistRow | null) ?? null

  return (
    <GoLiveChecklistView
      businessId={clientId}
      businessName={business.name ?? '—'}
      plan={business.plan ?? null}
      accountStatus={business.account_status ?? null}
      initialChecklist={checklist}
      initialAutoResult={autoResult}
    />
  )
}

