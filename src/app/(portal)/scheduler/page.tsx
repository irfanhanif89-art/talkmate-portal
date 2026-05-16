import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SchedulerView from '@/components/portal/scheduler-view'
import LockedPreview from '@/components/portal/locked-preview'
import SchedulerLockedDemo from '@/components/portal/scheduler-locked-demo'

export const metadata: Metadata = { title: 'Scheduler' }
export const dynamic = 'force-dynamic'

const PLAN_SMS_LIMITS: Record<string, number> = { starter: 0, growth: 200, pro: 500, professional: 500 }

export default async function SchedulerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: bizList } = await supabase
    .from('businesses')
    .select('id, plan, industry, vapi_agent_id, agent_last_synced_at, sms_used_this_month, account_status, created_at')
    .eq('owner_user_id', user.id)

  const business = (bizList ?? [])
    .filter(b => !['cancelled', 'expired'].includes((b.account_status as string) ?? ''))
    .sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime())[0]
  if (!business) redirect('/register')

  const plan = (business.plan as string | null) ?? 'starter'

  // Session 16 -- Starter clients see the locked preview. Growth and Pro
  // get the real scheduler.
  if (plan === 'starter') {
    return (
      <LockedPreview
        bannerTitle="The Scheduler is available on Growth and Pro plans"
        bannerSubtitle="Your agent books jobs automatically, sends SMS confirmations, and manages your waitlist."
        featurePills={['Agent books jobs', 'SMS confirmations', 'Waitlist management', 'Public holiday detection', 'Driver availability']}
        upgradeTarget="growth"
        upgradePrice={499}
        lockPlanLabel="Growth feature preview"
        lockBoldText="This is a preview of the Scheduler"
        lockMutedText="Upgrade to Growth to let your agent book jobs and manage your calendar automatically."
      >
        <SchedulerLockedDemo />
      </LockedPreview>
    )
  }

  return (
    <SchedulerView
      plan={plan}
      industry={(business.industry as string | null) ?? null}
      hasAgent={!!business.vapi_agent_id}
      initialLastSyncedAt={business.agent_last_synced_at ?? null}
      smsLimit={PLAN_SMS_LIMITS[plan] ?? 0}
      smsUsed={(business.sms_used_this_month as number | null) ?? 0}
    />
  )
}
