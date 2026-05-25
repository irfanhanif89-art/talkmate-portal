import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

// GET /api/dispatch/drivers — driver roster for the Drivers tab.
// Includes per-driver counts of active and total jobs.

export async function GET() {
  const auth = await requireClient()
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)

  const [driversRes, invitesRes, jobsRes] = await Promise.all([
    supabase
      .from('drivers')
      .select('id, name, phone, email, truck_type, truck_rego, is_online, is_available, is_active, created_at, updated_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
    supabase
      .from('driver_invites')
      .select('id, email, name, phone, truck_type, truck_rego, status, expires_at, created_at')
      .eq('client_id', clientId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase
      .from('dispatch_jobs')
      .select('driver_id, status, completed_at')
      .eq('client_id', clientId)
      .not('driver_id', 'is', null),
  ])

  const drivers = driversRes.data ?? []
  const jobs = jobsRes.data ?? []
  const invites = invitesRes.data ?? []

  const enriched = drivers.map(d => {
    const driverJobs = jobs.filter(j => j.driver_id === d.id)
    const activeToday = driverJobs.filter(j =>
      !['completed', 'cancelled', 'declined', 'invoiced', 'paid'].includes(j.status as string),
    ).length
    const totalJobs = driverJobs.length
    return { ...d, active_jobs: activeToday, total_jobs: totalJobs }
  })

  return NextResponse.json({ ok: true, drivers: enriched, pending_invites: invites })
}
