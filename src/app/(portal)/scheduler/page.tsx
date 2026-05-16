import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SchedulerView from '@/components/portal/scheduler-view'

export const metadata: Metadata = { title: 'Scheduler' }
export const dynamic = 'force-dynamic'

const PLAN_SMS_LIMITS: Record<string, number> = { starter: 0, growth: 200, pro: 500, professional: 500 }

export default async function SchedulerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id, plan, industry, vapi_agent_id, agent_last_synced_at, sms_used_this_month')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (!business) redirect('/register')

  const plan = (business.plan as string | null) ?? 'starter'
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
