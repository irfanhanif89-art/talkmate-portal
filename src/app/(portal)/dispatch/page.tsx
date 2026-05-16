import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DispatchBoard from './dispatch-board'
import LockedPreview from '@/components/portal/locked-preview'
import DispatchLockedDemo from '@/components/portal/dispatch-locked-demo'

export const metadata: Metadata = { title: 'Dispatch' }
export const dynamic = 'force-dynamic'

export default async function DispatchPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Session 16 -- pull every business row for this owner and prefer
  // active/trial over cancelled/expired so a stale .single() never
  // 500s the page. Matches the layout selector logic.
  const { data: bizList } = await supabase
    .from('businesses')
    .select('id, name, industry, plan, dispatch_enabled, dispatch_config, account_status, created_at')
    .eq('owner_user_id', user.id)

  const business = (bizList ?? [])
    .filter(b => !['cancelled', 'expired'].includes((b.account_status as string) ?? ''))
    .sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime())[0]
  if (!business) redirect('/register')

  const plan = (business.plan as string) ?? 'starter'
  const industry = (business.industry as string) ?? ''
  const isPro = plan === 'pro' || plan === 'professional'

  // Session 16 -- locked preview for non-Pro towing clients. The demo
  // dispatch board renders behind the upgrade banner / lock bar.
  if (industry === 'towing' && !isPro) {
    return (
      <LockedPreview
        bannerTitle="Dispatch is available on the Pro plan"
        bannerSubtitle="Manage your drivers, jobs, and vehicles from one live board."
        featurePills={['Live driver board', 'Job queue', 'Shift scheduling', 'Driver availability', 'Vehicle registry']}
        upgradeTarget="pro"
        upgradePrice={799}
        lockPlanLabel="Pro feature preview"
        lockBoldText="This is a preview of Dispatch"
        lockMutedText="Upgrade to Pro to unlock your live driver board and start managing jobs."
      >
        <DispatchLockedDemo />
      </LockedPreview>
    )
  }

  return (
    <div style={{ padding: 24, color: '#F2F6FB' }}>
      <DispatchBoard
        plan={plan}
        industry={industry}
        dispatchEnabled={!!business.dispatch_enabled}
        isPaidTier={isPro}
        isDispatchIndustry={industry === 'towing'}
      />
    </div>
  )
}
