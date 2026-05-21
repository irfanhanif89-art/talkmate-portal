import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyAdminAlert } from '@/lib/sales-notify'

// Vercel cron: runs daily at 11pm UTC = 9am AEST
// Schedule defined in vercel.json: "0 23 * * *"
//
// Finds contractor_commissions where status = 'pending' and the
// 14-day clawback window has elapsed, flips them to 'cleared', and
// posts a Telegram summary line. The clawback period itself is owned
// by contractor-commission.ts (clawbackEndsAt).

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const nowIso = new Date().toISOString()

  const { data: eligible, error: selectError } = await supabase
    .from('contractor_commissions')
    .select('id, commission_amount')
    .eq('status', 'pending')
    .lt('clawback_period_ends_at', nowIso)

  if (selectError) {
    return NextResponse.json({ ok: false, error: selectError.message }, { status: 500 })
  }

  const rows = eligible ?? []
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, cleared: 0, total: 0 })
  }

  const ids = rows.map(r => r.id)
  const total = rows.reduce((sum, r) => sum + Number(r.commission_amount ?? 0), 0)

  const { error: updateError } = await supabase
    .from('contractor_commissions')
    .update({ status: 'cleared' })
    .in('id', ids)

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 })
  }

  notifyAdminAlert(
    `✅ ${rows.length} contractor commission${rows.length === 1 ? '' : 's'} auto-cleared totalling $${total.toFixed(2)}`,
  ).catch(() => {})

  return NextResponse.json({ ok: true, cleared: rows.length, total })
}
