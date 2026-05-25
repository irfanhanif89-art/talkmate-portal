// Monthly data-retention cron — Session 11.
//
// For each business with a positive data_retention_days, computes a
// cutoff date and counts rows older than that in the retention-eligible
// tables (calls, bookings, callbacks, dispatch_jobs). The cron defaults
// to DRY RUN — it never deletes anything unless DRY_RUN_RETENTION is
// explicitly set to 'false' in the environment.
//
// Tables intentionally excluded from purge:
//   - businesses, users, team_members, staff_members — identity rows
//   - contacts — clients' CRM; only the client can delete a contact
//
// The action is written to admin_audit_log with action='data_retention_purge'
// (live mode) or 'data_retention_dry_run' (default). business_id is the
// affected client, admin_email is logged as 'cron@talkmate.com.au'.

import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { logAdminAction } from '@/lib/audit'

// Tables and their per-row "age column". We delete rows where the age
// column is < cutoff. Each entry also names the foreign key used to
// scope by business — different across the schema.
const RETENTION_TABLES: Array<{
  table: string
  age_column: string
  client_column: 'business_id' | 'client_id'
}> = [
  { table: 'calls', age_column: 'created_at', client_column: 'business_id' },
  { table: 'bookings', age_column: 'created_at', client_column: 'client_id' },
  { table: 'callbacks', age_column: 'created_at', client_column: 'client_id' },
  { table: 'dispatch_jobs', age_column: 'created_at', client_column: 'client_id' },
]

export async function GET(req: Request) {
  const unauthorized = verifyCron(req)
  if (unauthorized) return unauthorized

  // 'false' (case-insensitive) is the only value that enables real
  // deletion. Any other value, or unset, stays in dry-run mode.
  const dryRun = (process.env.DRY_RUN_RETENTION ?? 'true').toLowerCase() !== 'false'

  const admin = createAdminClient()
  const { data: businesses, error } = await admin
    .from('businesses')
    .select('id, name, data_retention_days')
    .gt('data_retention_days', 0)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const summary: Array<{
    business_id: string
    business_name: string | null
    retention_days: number
    cutoff: string
    counts: Record<string, number>
    deleted: boolean
  }> = []

  for (const biz of businesses ?? []) {
    const days = Number((biz as { data_retention_days?: number }).data_retention_days ?? 365)
    if (!Number.isFinite(days) || days <= 0) continue
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    const counts: Record<string, number> = {}

    for (const t of RETENTION_TABLES) {
      // Count matching rows first — useful in both dry-run and live mode.
      const { count } = await admin
        .from(t.table)
        .select('id', { count: 'exact', head: true })
        .eq(t.client_column, biz.id)
        .lt(t.age_column, cutoff)
      counts[t.table] = count ?? 0

      if (!dryRun && counts[t.table] > 0) {
        const { error: delErr } = await admin
          .from(t.table)
          .delete()
          .eq(t.client_column, biz.id)
          .lt(t.age_column, cutoff)
        if (delErr) console.error(`[data-retention] delete failed for ${t.table}:${biz.id}`, delErr.message)
      }
    }

    const totalRows = Object.values(counts).reduce((sum, n) => sum + n, 0)
    if (totalRows > 0) {
      await logAdminAction({
        adminEmail: 'cron@talkmate.com.au',
        action: dryRun ? 'data_retention_dry_run' : 'data_retention_purge',
        businessId: biz.id,
        businessName: biz.name ?? null,
        after: {
          retention_days: days,
          cutoff,
          counts,
          dry_run: dryRun,
        },
      })
    }

    summary.push({
      business_id: biz.id,
      business_name: biz.name ?? null,
      retention_days: days,
      cutoff,
      counts,
      deleted: !dryRun,
    })
  }

  // Sessions 36-37 — flat 90-day retention for driver_location_history.
  // This table grows unboundedly (one row per active-job GPS ping) so
  // it has its own non-tenant-configurable retention regardless of the
  // per-business data_retention_days setting. Stays inside DRY RUN
  // until DRY_RUN_RETENTION=false so a stray run never wipes route
  // history mid-investigation.
  const locationCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { count: locationHistoryCount } = await admin
    .from('driver_location_history')
    .select('id', { count: 'exact', head: true })
    .lt('recorded_at', locationCutoff)
  if (!dryRun && (locationHistoryCount ?? 0) > 0) {
    const { error: delErr } = await admin
      .from('driver_location_history')
      .delete()
      .lt('recorded_at', locationCutoff)
    if (delErr) console.error('[data-retention] driver_location_history delete failed', delErr.message)
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    businesses_processed: summary.length,
    summary,
    driver_location_history: {
      cutoff: locationCutoff,
      candidate_rows: locationHistoryCount ?? 0,
      deleted: !dryRun,
    },
  })
}
