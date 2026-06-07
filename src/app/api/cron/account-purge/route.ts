// GET /api/cron/account-purge  (Vercel cron, daily 03:23)
//
// Permanently deletes accounts whose 30-day deletion grace window has elapsed
// (Apple App Store Review Guideline 5.1.1(v) — deletion must actually happen,
// not just disable). SCOPED to rows where deletion_scheduled_for <= now(), so
// live customers who never requested deletion are never touched.
//
// Each account is purged via a transactional SQL function (app_purge_business /
// app_purge_sales_rep) that handles the FK ordering, then the auth identity is
// removed. Failures are isolated per-account, logged, and alerted — never
// partial (the SQL functions are transactional).

import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendAdminTelegram } from '@/lib/notifications'
import { logAdminAction } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const BATCH = 25  // safety cap per run

export async function GET(req: Request) {
  const unauthorized = verifyCron(req)
  if (unauthorized) return unauthorized

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  const results = { businesses: 0, reps: 0, errors: [] as string[] }

  // ── Business accounts due for purge ──
  const { data: dueBiz } = await admin
    .from('businesses')
    .select('id, name, owner_user_id')
    .not('deletion_scheduled_for', 'is', null)
    .lte('deletion_scheduled_for', nowIso)
    .limit(BATCH)

  for (const b of dueBiz ?? []) {
    try {
      const { data: ownerId, error } = await admin.rpc('app_purge_business', { p_business_id: b.id })
      if (error) throw new Error(error.message)
      if (ownerId) {
        const { error: delErr } = await admin.auth.admin.deleteUser(ownerId as string)
        if (delErr) results.errors.push(`auth(biz ${b.id}): ${delErr.message}`)
      }
      await logAdminAction({
        adminEmail: 'cron@talkmate.com.au',
        action: 'account_purged',
        businessName: b.name ?? null,
        after: { purged_business_id: b.id, role: 'client' },
      })
      results.businesses++
    } catch (e) {
      results.errors.push(`biz ${b.id}: ${(e as Error).message}`)
    }
  }

  // ── Sales-rep accounts due for purge ──
  const { data: dueReps } = await admin
    .from('sales_reps')
    .select('id, full_name, user_id')
    .not('deletion_scheduled_for', 'is', null)
    .lte('deletion_scheduled_for', nowIso)
    .limit(BATCH)

  for (const r of dueReps ?? []) {
    try {
      const { error } = await admin.rpc('app_purge_sales_rep', { p_user_id: r.user_id })
      if (error) throw new Error(error.message)
      const { error: delErr } = await admin.auth.admin.deleteUser(r.user_id as string)
      if (delErr) results.errors.push(`auth(rep ${r.id}): ${delErr.message}`)
      await logAdminAction({
        adminEmail: 'cron@talkmate.com.au',
        action: 'account_purged',
        businessName: r.full_name ?? null,
        after: { purged_rep_id: r.id, role: 'sales_rep' },
      })
      results.reps++
    } catch (e) {
      results.errors.push(`rep ${r.id}: ${(e as Error).message}`)
    }
  }

  if (results.businesses || results.reps || results.errors.length) {
    await sendAdminTelegram(
      `🗑️ Account purge: ${results.businesses} business(es), ${results.reps} rep(s) permanently deleted.` +
      (results.errors.length ? `\n⚠️ ${results.errors.length} error(s): ${results.errors.slice(0, 5).join('; ')}` : '')
    )
  }

  return NextResponse.json({ ok: true, ...results })
}
