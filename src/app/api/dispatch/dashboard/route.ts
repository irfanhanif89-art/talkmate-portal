import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

// GET /api/dispatch/dashboard — top-of-page stats + Live Board feed.

export async function GET() {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)

  // Pull the data we need in parallel.
  const [activeJobsRes, driversRes, completedTodayRes] = await Promise.all([
    supabase
      .from('dispatch_jobs')
      .select('id, job_number, job_type, status, pickup_address, dropoff_address, customer_name, customer_phone, vehicle_make, vehicle_model, vehicle_colour, vehicle_rego, driver_id, notified_at, accepted_at, response_deadline, driver_eta_mins, created_at, updated_at')
      .eq('client_id', clientId)
      .not('status', 'in', '("completed","cancelled","invoiced","paid","declined")')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('drivers')
      .select('id, name, phone, truck_type, truck_rego, is_online, is_available, is_active, avatar_url, updated_at')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('dispatch_jobs')
      .select('id, accepted_at, notified_at')
      .eq('client_id', clientId)
      .eq('status', 'completed')
      .gte('completed_at', dayStart.toISOString()),
  ])

  const activeJobs = activeJobsRes.data ?? []
  const drivers = driversRes.data ?? []
  const completedToday = completedTodayRes.data ?? []

  // Avg response time: minutes from notified_at to accepted_at,
  // averaged across today's accepted jobs.
  const responseTimes = activeJobs
    .concat(completedToday as typeof activeJobs)
    .filter(j => j.notified_at && j.accepted_at)
    .map(j => (new Date(j.accepted_at as string).getTime() - new Date(j.notified_at as string).getTime()) / 60000)
  const avgResponseMins = responseTimes.length
    ? Math.round((responseTimes.reduce((s, n) => s + n, 0) / responseTimes.length) * 10) / 10
    : null

  // Annotate active jobs with driver name for the card.
  const driversById = new Map(drivers.map(d => [d.id as string, d]))
  const enrichedJobs = activeJobs.map(j => ({
    ...j,
    driver_name: j.driver_id ? driversById.get(j.driver_id as string)?.name ?? null : null,
  }))

  return NextResponse.json({
    ok: true,
    stats: {
      active_jobs_count: activeJobs.length,
      drivers_online_count: drivers.filter(d => d.is_online).length,
      jobs_today_count: completedToday.length,
      avg_response_time_mins: avgResponseMins,
    },
    active_jobs: enrichedJobs,
    drivers,
  })
}
