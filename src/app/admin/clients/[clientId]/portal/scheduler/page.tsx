import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import SchedulerView from '@/components/portal/scheduler-view'

export const dynamic = 'force-dynamic'

const PLAN_SMS_LIMITS: Record<string, number> = { starter: 0, growth: 200, pro: 500, professional: 500 }

export default async function AdminSchedulerPage({
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
    .select('id, plan, industry, vapi_agent_id, agent_last_synced_at, sms_used_this_month')
    .eq('id', clientId)
    .maybeSingle()
  if (!business) redirect('/admin/clients')

  const plan = (business.plan as string | null) ?? 'starter'
  return (
    <SchedulerView
      plan={plan}
      industry={(business.industry as string | null) ?? null}
      hasAgent={!!business.vapi_agent_id}
      initialLastSyncedAt={business.agent_last_synced_at ?? null}
      adminClientId={clientId}
      smsLimit={PLAN_SMS_LIMITS[plan] ?? 0}
      smsUsed={(business.sms_used_this_month as number | null) ?? 0}
    />
  )
}
