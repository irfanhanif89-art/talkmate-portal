// Sessions 36-37 — auto-reassign cron. Runs every 5 minutes.
//
// Picks every dispatch_jobs row in status='driver_notified' whose
// response_deadline has passed. For each:
//
//   1. Append the silent driver to declined_driver_ids.
//   2. Reset status='created', driver_id=null so dispatchJobToDriver
//      can offer it again cleanly.
//   3. Auto-dispatch to the next eligible driver (truck-type filter
//      honoured; previously-declined drivers excluded).
//   4. If no driver available: leave the job in 'created' and the
//      runtime fires an URGENT Telegram alert (handled inside
//      dispatchJobToDriver).
//
// Auth: standard CRON_SECRET bearer token, matches every other cron
// in /api/cron/*.

import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendAdminTelegram } from '@/lib/notifications'
import { dispatchJobToDriver } from '@/lib/dispatch-runtime'

export async function GET(req: Request) {
  const unauthorized = verifyCron(req)
  if (unauthorized) return unauthorized

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data: expired, error } = await admin
    .from('dispatch_jobs')
    .select('id, client_id, job_number, driver_id, declined_driver_ids, dispatch_attempt')
    .eq('status', 'driver_notified')
    .lt('response_deadline', nowIso)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  if (!expired || expired.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  let reassigned = 0
  let stranded = 0

  for (const job of expired) {
    // Look up the silent driver's name for the alert.
    let silentName = 'driver'
    if (job.driver_id) {
      const { data: prev } = await admin
        .from('drivers')
        .select('name')
        .eq('id', job.driver_id)
        .maybeSingle()
      silentName = (prev?.name as string) ?? 'driver'
    }

    // Step 1: append silent driver to declined_driver_ids, reset.
    const declinedIds = job.driver_id
      ? [...((job.declined_driver_ids as string[] | null) ?? []), job.driver_id as string]
      : ((job.declined_driver_ids as string[] | null) ?? [])

    await admin
      .from('dispatch_jobs')
      .update({
        status: 'created',
        driver_id: null,
        notified_at: null,
        response_deadline: null,
        declined_driver_ids: declinedIds,
      })
      .eq('id', job.id)

    // Step 2: try to dispatch to next driver.
    const result = await dispatchJobToDriver({
      jobId: job.id as string,
      clientId: job.client_id as string,
      preferredDriverId: null,
      autoDispatch: true,
    })

    if (result.ok) {
      reassigned++
      void sendAdminTelegram(
        `🔁 No response from ${silentName}. Job ${job.job_number ?? job.id} reassigned (attempt ${(job.dispatch_attempt ?? 0) + 1}).`,
      ).catch(() => {})
    } else {
      stranded++
      // dispatchJobToDriver already fired the URGENT Telegram alert
      // when no driver was available; we don't double-fire here.
    }
  }

  return NextResponse.json({
    ok: true,
    processed: expired.length,
    reassigned,
    stranded,
  })
}
