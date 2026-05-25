import { redirect, notFound } from 'next/navigation'
import { requireDriver } from '@/lib/driver-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { JobClient } from './job-client'
import type { DispatchJobRow, DispatchJobPhotoRow } from '@/lib/dispatch-types'

// Sessions 36-37 — the driver's primary working screen. SSR fetches
// the full job + photos so the client lands with everything in hand;
// subsequent mutations refetch via the API.

export const dynamic = 'force-dynamic'

export default async function DriverJobPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const auth = await requireDriver()
  if (!auth.ok) redirect('/driver/login')

  const admin = createAdminClient()

  const { data: job } = await admin
    .from('dispatch_jobs')
    .select('*')
    .eq('id', id)
    .eq('driver_id', auth.driver.id)
    .maybeSingle()

  if (!job) notFound()

  const { data: photos } = await admin
    .from('dispatch_job_photos')
    .select('id, dispatch_job_id, driver_id, photo_url, photo_type, caption, taken_at')
    .eq('dispatch_job_id', id)
    .order('taken_at', { ascending: true })

  const { data: business } = await admin
    .from('businesses')
    .select('name')
    .eq('id', auth.driver.client_id)
    .maybeSingle()

  return (
    <JobClient
      driver={auth.driver}
      businessName={business?.name ?? ''}
      initialJob={job as DispatchJobRow}
      initialPhotos={(photos ?? []) as DispatchJobPhotoRow[]}
    />
  )
}
