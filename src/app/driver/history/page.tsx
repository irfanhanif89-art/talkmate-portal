import { redirect } from 'next/navigation'
import { requireDriver } from '@/lib/driver-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { DriverHistoryClient } from './history-client'

export const dynamic = 'force-dynamic'

export default async function DriverHistoryPage() {
  const auth = await requireDriver()
  if (!auth.ok) redirect('/driver/login')

  const admin = createAdminClient()
  const { data: business } = await admin
    .from('businesses')
    .select('name')
    .eq('id', auth.driver.client_id)
    .maybeSingle()

  // Last 20 completed jobs for this driver.
  const { data: jobs } = await admin
    .from('dispatch_jobs')
    .select('id, job_number, job_type, status, completed_at, final_amount, payment_collected, payment_collected_type, pickup_address, dropoff_address, actual_distance_km')
    .eq('driver_id', auth.driver.id)
    .in('status', ['completed','invoiced','paid'])
    .order('completed_at', { ascending: false })
    .limit(20)

  // Month-to-date totals.
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const { data: monthJobs } = await admin
    .from('dispatch_jobs')
    .select('final_amount, actual_distance_km, payment_collected')
    .eq('driver_id', auth.driver.id)
    .in('status', ['completed','invoiced','paid'])
    .gte('completed_at', monthStart.toISOString())

  const monthTotalJobs = monthJobs?.length ?? 0
  const monthDistance = (monthJobs ?? []).reduce(
    (s, j) => s + Number(j.actual_distance_km ?? 0),
    0,
  )
  const monthEarnings = (monthJobs ?? [])
    .filter(j => j.payment_collected)
    .reduce((s, j) => s + Number(j.final_amount ?? 0), 0)

  return (
    <DriverHistoryClient
      driver={auth.driver}
      businessName={business?.name ?? ''}
      jobs={jobs ?? []}
      monthTotals={{
        jobs: monthTotalJobs,
        distance_km: Math.round(monthDistance * 10) / 10,
        earnings: Math.round(monthEarnings * 100) / 100,
      }}
    />
  )
}
