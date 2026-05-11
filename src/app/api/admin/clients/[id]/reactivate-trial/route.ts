import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

const TRIAL_DAYS = 7

// Restart a 7-day trial. Used by the "Reactivate trial" button on
// expired accounts.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const start = new Date()
  const end = new Date(start.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('businesses')
    .update({
      account_status: 'trial',
      trial_start_date: start.toISOString(),
      trial_end_date: end.toISOString(),
    })
    .eq('id', id)
    .select('id, name, account_status, trial_start_date, trial_end_date')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await admin.from('client_comms_log').insert({
    business_id: id,
    note: `Trial reactivated for ${TRIAL_DAYS} more days.`,
  })

  return NextResponse.json({ ok: true, business: data })
}
