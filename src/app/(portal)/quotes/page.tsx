import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import QuotesLogView from '@/components/portal/quotes-log-view'
import LockedPreview from '@/components/portal/locked-preview'
import QuotesLockedDemo from '@/components/portal/quotes-locked-demo'

export const dynamic = 'force-dynamic'

export default async function QuotesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: bizList } = await supabase
    .from('businesses')
    .select('id, plan, account_status, created_at')
    .eq('owner_user_id', user.id)

  const business = (bizList ?? [])
    .filter(b => !['cancelled', 'expired'].includes((b.account_status as string) ?? ''))
    .sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime())[0]

  const plan = (business?.plan as string | null) ?? 'starter'
  const isStarter = plan === 'starter'

  if (isStarter) {
    return (
      <LockedPreview
        bannerTitle="Quote logging is available on Growth and Pro plans"
        bannerSubtitle="Every quote your agent gives is logged here with address, distance, price, and status."
        featurePills={['Live distance quotes', 'Quote history', 'Accept and decline tracking', 'Revenue estimates']}
        upgradeTarget="growth"
        upgradePrice={499}
        lockPlanLabel="Growth feature preview"
        lockBoldText="This is a preview of Quote Logging"
        lockMutedText="Upgrade to Growth so your agent logs every quote, distance, and price automatically."
      >
        <QuotesLockedDemo />
      </LockedPreview>
    )
  }

  return <QuotesLogView />
}
