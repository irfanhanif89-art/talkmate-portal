import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/server'
import QuotesLogView from '@/components/portal/quotes-log-view'
import LockedPreview from '@/components/portal/locked-preview'
import QuotesLockedDemo from '@/components/portal/quotes-locked-demo'

export const dynamic = 'force-dynamic'

export default async function AdminQuotesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/login')
  const { clientId } = await params

  const admin = createAdminClient()
  const { data: business } = await admin
    .from('businesses')
    .select('plan')
    .eq('id', clientId)
    .maybeSingle()

  const plan = (business?.plan as string | null) ?? 'starter'
  const isStarter = plan === 'starter'

  if (isStarter) {
    return (
      <LockedPreview
        adminClientId={clientId}
        bannerTitle="Quote logging is available on Growth and Pro plans"
        bannerSubtitle="Every quote your agent gives is logged here with address, distance, price, and status."
        featurePills={['Live distance quotes', 'Quote history', 'Accept and decline tracking', 'Revenue estimates']}
        upgradeTarget="growth"
        upgradePrice={499}
        lockPlanLabel="Growth feature preview"
        lockBoldText="This is a preview of Quote Logging"
        lockMutedText="Upgrade this client to Growth so their agent logs every quote, distance, and price."
      >
        <QuotesLockedDemo />
      </LockedPreview>
    )
  }

  return <QuotesLogView adminClientId={clientId} />
}
