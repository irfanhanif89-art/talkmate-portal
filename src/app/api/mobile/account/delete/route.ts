// POST /api/mobile/account/delete
//
// In-app account deletion for the mobile app (Apple App Store Review Guideline
// 5.1.1(v)). Authenticates the caller via their Supabase Bearer token, then:
//   • disables the account immediately (status change + auth ban), and
//   • schedules a permanent purge 30 days out (deletion_scheduled_for).
// The /api/cron/account-purge cron carries out the irreversible deletion.
//
// Works for both account types the app serves: business owners (client app)
// and TalkMate sales reps. A grace window lets support reverse an accidental
// deletion before the purge runs.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { logAdminAction } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const GRACE_DAYS = 30
// ~100 years — effectively permanent. The account is unbanned only if support
// reverses the request inside the grace window; otherwise it is purged.
const BAN_DURATION = '876000h'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') ?? request.headers.get('Authorization')
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const jwt = authHeader.slice(7).trim()
  if (!jwt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }
  const userId = userData.user.id
  const userEmail = userData.user.email ?? null

  const requestedAt = new Date().toISOString()
  const scheduledFor = new Date(Date.now() + GRACE_DAYS * 86400000).toISOString()

  // ── Business owner (client app) ──
  const { data: biz } = await admin
    .from('businesses')
    .select('id, name')
    .eq('owner_user_id', userId)
    .maybeSingle()

  if (biz) {
    const { error } = await admin
      .from('businesses')
      .update({
        account_status: 'suspended',
        deletion_requested_at: requestedAt,
        deletion_scheduled_for: scheduledFor,
      })
      .eq('id', biz.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await admin.auth.admin.updateUserById(userId, { ban_duration: BAN_DURATION })
    await logAdminAction({
      adminEmail: userEmail ?? 'mobile-app',
      action: 'account_deletion_requested',
      businessId: biz.id,
      businessName: biz.name ?? null,
      after: { deletion_scheduled_for: scheduledFor, role: 'client' },
    })
    return NextResponse.json({ ok: true, scheduledFor })
  }

  // ── Sales rep ──
  const { data: rep } = await admin
    .from('sales_reps')
    .select('id, full_name')
    .eq('user_id', userId)
    .maybeSingle()

  if (rep) {
    const { error } = await admin
      .from('sales_reps')
      .update({
        status: 'inactive',
        deletion_requested_at: requestedAt,
        deletion_scheduled_for: scheduledFor,
      })
      .eq('id', rep.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await admin.auth.admin.updateUserById(userId, { ban_duration: BAN_DURATION })
    await logAdminAction({
      adminEmail: userEmail ?? 'mobile-app',
      action: 'account_deletion_requested',
      businessName: rep.full_name ?? null,
      after: { deletion_scheduled_for: scheduledFor, role: 'sales_rep' },
    })
    return NextResponse.json({ ok: true, scheduledFor })
  }

  return NextResponse.json({ error: 'No account associated with this user' }, { status: 404 })
}
