import { requireAdmin } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import LockedPreview from '@/components/portal/locked-preview'
import DispatchLockedDemo from '@/components/portal/dispatch-locked-demo'

export const dynamic = 'force-dynamic'

export default async function AdminDispatchPage({
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
    .select('id, plan, industry, account_status')
    .eq('id', clientId)
    .maybeSingle()

  const plan = (business?.plan as string | null) ?? 'starter'
  const industry = (business?.industry as string | null) ?? ''
  const isPro = plan === 'pro' || plan === 'professional'

  // Session 16 -- admin parity. Non-Pro towing clients see the locked
  // preview here too; the upgrade button routes to the client edit
  // modal so Irfan can lift the plan from inside the admin view.
  if (industry === 'towing' && !isPro) {
    return (
      <LockedPreview
        adminClientId={clientId}
        bannerTitle="Dispatch is available on the Pro plan"
        bannerSubtitle="Manage your drivers, jobs, and vehicles from one live board."
        featurePills={['Live driver board', 'Job queue', 'Shift scheduling', 'Driver availability', 'Vehicle registry']}
        upgradeTarget="pro"
        upgradePrice={799}
        lockPlanLabel="Pro feature preview"
        lockBoldText="This is a preview of Dispatch"
        lockMutedText="Upgrade this client to Pro to unlock the live driver board."
      >
        <DispatchLockedDemo />
      </LockedPreview>
    )
  }

  // Session 30 — non-towing or Pro towing clients land directly in the
  // client portal via magic-link impersonation. The dispatch board is
  // live + websocket-driven, so an inline admin view would diverge from
  // what the client sees; punching through avoids that drift.
  redirect(`/api/admin/clients/${clientId}/impersonate?redirect=1&next=/dashboard`)
}
