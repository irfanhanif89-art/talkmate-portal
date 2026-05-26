import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/audit'
import { unassignVapiPhone } from '@/lib/vapi-phone'

// Immediately set a trial to 'expired'. Used by the "End trial now" button.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('businesses')
    .update({
      account_status: 'expired',
      trial_end_date: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, name, account_status, trial_end_date')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Session 42 (H8) — unbind Vapi phoneNumber on manual trial expiry,
  // same as the expire-trials cron does automatically.
  await unassignVapiPhone(id, 'expired')

  await admin.from('client_comms_log').insert({
    business_id: id,
    note: 'Trial ended manually by admin.',
  })

  await logAdminAction({
    adminEmail: auth.user.email ?? 'unknown',
    action: 'trial_ended',
    businessId: id,
    businessName: data?.name ?? null,
    after: { account_status: 'expired' },
    request: req,
  })

  return NextResponse.json({ ok: true, business: data })
}
