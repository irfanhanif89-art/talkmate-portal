import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// POST /api/command/confirm  body: { logId: string, confirm: boolean }
// Resolves a pending command. Real execution of the underlying intent should
// be wired to specific handlers (send-invoice, update-menu, etc.) — for the
// MVP we update the log row and let downstream automations pick it up.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { logId, confirm } = (await req.json().catch(() => ({}))) as { logId?: string; confirm?: boolean }
  if (!logId) return NextResponse.json({ ok: false, error: 'logId required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: log } = await admin.from('command_logs').select('*').eq('id', logId).single()
  if (!log) return NextResponse.json({ ok: false, error: 'log not found' }, { status: 404 })

  // Verify ownership
  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
  if (!business || business.id !== log.business_id) return NextResponse.json({ ok: false }, { status: 403 })

  if (log.outcome !== 'pending_confirmation') {
    return NextResponse.json({ ok: false, error: `Already ${log.outcome}` }, { status: 400 })
  }

  if (log.expires_at && new Date(log.expires_at).getTime() < Date.now()) {
    await admin.from('command_logs').update({ outcome: 'cancelled', action_taken: 'expired' }).eq('id', logId)
    return NextResponse.json({ ok: false, error: 'Confirmation window expired' }, { status: 410 })
  }

  await admin.from('command_logs').update({
    outcome: confirm ? 'success' : 'cancelled',
    confirmed: !!confirm,
    action_taken: confirm ? 'executed' : 'cancelled',
  }).eq('id', logId)

  return NextResponse.json({ ok: true, executed: !!confirm })
}
