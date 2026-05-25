import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

// GET /api/admin/dispatch/overview — TalkMate-admin parity view.
// Cross-business dispatcher state: total active clients, drivers
// online, jobs in flight, jobs stuck in driver_notified for 30+ mins.

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
  const stuckCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()

  const [bizRes, driversRes, jobsRes, completedRes, stuckRes] = await Promise.all([
    admin.from('businesses').select('id, name').eq('dispatch_enabled', true).order('name'),
    admin.from('drivers').select('id, client_id, is_online, is_active'),
    admin.from('dispatch_jobs')
      .select('id, client_id, status, notified_at, accepted_at')
      .not('status', 'in', '("completed","cancelled","invoiced","paid","declined")'),
    admin.from('dispatch_jobs')
      .select('id, client_id, accepted_at, notified_at')
      .eq('status', 'completed')
      .gte('completed_at', dayStart.toISOString()),
    admin.from('dispatch_jobs')
      .select('id, client_id, job_number, job_type, pickup_address, notified_at')
      .eq('status', 'driver_notified')
      .lt('notified_at', stuckCutoff),
  ])

  const drivers = driversRes.data ?? []
  const jobs = jobsRes.data ?? []
  const completed = completedRes.data ?? []

  // Per-business breakdown.
  const businesses = (bizRes.data ?? []).map(b => {
    const bizDrivers = drivers.filter(d => d.client_id === b.id && d.is_active)
    const bizJobs = jobs.filter(j => j.client_id === b.id)
    const bizCompletedToday = completed.filter(j => j.client_id === b.id)
    const responseTimes = bizCompletedToday
      .filter(j => j.notified_at && j.accepted_at)
      .map(j => (new Date(j.accepted_at as string).getTime() - new Date(j.notified_at as string).getTime()) / 60000)
    const avgResponse = responseTimes.length
      ? Math.round((responseTimes.reduce((s, n) => s + n, 0) / responseTimes.length) * 10) / 10
      : null
    return {
      id: b.id,
      name: b.name,
      drivers_online: bizDrivers.filter(d => d.is_online).length,
      drivers_total: bizDrivers.length,
      active_jobs: bizJobs.length,
      jobs_today: bizCompletedToday.length,
      avg_response_mins: avgResponse,
    }
  })

  // Attach business name to each stuck job.
  const stuckJobs = (stuckRes.data ?? []).map(j => ({
    ...j,
    business_name: businesses.find(b => b.id === j.client_id)?.name ?? null,
  }))

  return NextResponse.json({
    ok: true,
    totals: {
      clients_using_dispatcher: businesses.length,
      drivers_online: drivers.filter(d => d.is_online).length,
      active_jobs_right_now: jobs.length,
      jobs_today: completed.length,
    },
    businesses,
    stuck_jobs: stuckJobs,
  })
}
