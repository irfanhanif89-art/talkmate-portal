import { redirect } from 'next/navigation'
import { requireDriver } from '@/lib/driver-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { DriverDashboardClient } from './dashboard-client'

// Sessions 36-37 — driver dashboard. SSR'd shell + hydrated client
// for the live state. The shell does the auth gate (the middleware
// already enforces it, but we re-check on the page so the client
// has driver+business in hand without an extra fetch).

export const dynamic = 'force-dynamic'

export default async function DriverDashboardPage() {
  const auth = await requireDriver()
  if (!auth.ok) redirect('/driver/login')

  const admin = createAdminClient()

  const { data: business } = await admin
    .from('businesses')
    .select('name, phone')
    .eq('id', auth.driver.client_id)
    .maybeSingle()

  // Today bounds.
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)

  // Active job: anything in-flight assigned to this driver.
  const activeStatuses = [
    'driver_notified','accepted','en_route','on_scene','loaded','in_transit','at_dropoff',
  ] as const
  const { data: activeJob } = await admin
    .from('dispatch_jobs')
    .select('id, job_number, job_type, status, pickup_address, response_deadline, driver_eta_mins, customer_name, vehicle_make, vehicle_model, vehicle_rego')
    .eq('driver_id', auth.driver.id)
    .in('status', activeStatuses as unknown as string[])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Completed today (recents).
  const { data: completedToday } = await admin
    .from('dispatch_jobs')
    .select('id, job_number, job_type, completed_at, final_amount, payment_collected, pickup_address')
    .eq('driver_id', auth.driver.id)
    .eq('status', 'completed')
    .gte('completed_at', dayStart.toISOString())
    .order('completed_at', { ascending: false })
    .limit(5)

  const jobsToday = completedToday?.length ?? 0
  const earningsToday = (completedToday ?? [])
    .filter(j => j.payment_collected)
    .reduce((sum, j) => sum + Number(j.final_amount ?? 0), 0)

  return (
    <DriverDashboardClient
      driver={auth.driver}
      businessName={business?.name ?? ''}
      activeJob={activeJob ?? null}
      completedToday={completedToday ?? []}
      stats={{
        jobs_today: jobsToday,
        earnings_today: Math.round(earningsToday * 100) / 100,
      }}
    />
  )
}
