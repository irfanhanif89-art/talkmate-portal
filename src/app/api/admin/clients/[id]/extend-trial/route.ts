import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/audit'

const EXTEND_DAYS = 3

// Adds EXTEND_DAYS days to the current trial_end_date. If the trial has
// already lapsed (trial_end_date is in the past) we extend from "now"
// instead of from the lapsed timestamp.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: current, error: readErr } = await admin
    .from('businesses')
    .select('id, account_status, trial_end_date')
    .eq('id', id)
    .single()
  if (readErr || !current) {
    return NextResponse.json({ ok: false, error: readErr?.message ?? 'business not found' }, { status: 404 })
  }
  if (current.account_status !== 'trial' && current.account_status !== 'expired') {
    return NextResponse.json({ ok: false, error: 'only trial or expired accounts can be extended' }, { status: 400 })
  }

  const now = Date.now()
  const base = current.trial_end_date ? new Date(current.trial_end_date).getTime() : now
  const startFrom = Math.max(base, now)
  const newEnd = new Date(startFrom + EXTEND_DAYS * 24 * 60 * 60 * 1000)

  const { data, error } = await admin
    .from('businesses')
    .update({
      account_status: 'trial',
      trial_end_date: newEnd.toISOString(),
    })
    .eq('id', id)
    .select('id, name, account_status, trial_end_date')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await admin.from('client_comms_log').insert({
    business_id: id,
    note: `Trial extended by ${EXTEND_DAYS} days. New end date ${newEnd.toISOString().slice(0, 10)}.`,
  })

  await logAdminAction({
    adminEmail: auth.user.email ?? 'unknown',
    action: 'trial_extended',
    businessId: id,
    businessName: data?.name ?? null,
    before: { trial_end_date: current.trial_end_date },
    after: { trial_end_date: newEnd.toISOString(), extended_days: EXTEND_DAYS },
    request: req,
  })

  return NextResponse.json({ ok: true, business: data })
}
