import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createTelegramBotForClient } from '@/lib/telegram-bot-creator'
import { logAdminAction } from '@/lib/audit'
import { reassignVapiPhone } from '@/lib/vapi-phone'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: before } = await admin
    .from('businesses')
    .select('name, account_status')
    .eq('id', id)
    .maybeSingle()

  const { error } = await admin.from('businesses').update({ account_status: 'active' }).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Session 42 (H8) — re-bind Vapi phoneNumber if it was previously
  // unassigned (cancelled/expired/suspended → active path). Idempotent:
  // no-ops if vapi_phone_unassigned_at is null.
  await reassignVapiPhone(id)

  await admin.from('client_admin_notes').insert({
    business_id: id,
    note: 'Account activated by admin.',
  })

  await logAdminAction({
    adminEmail: auth.user.email ?? 'unknown',
    action: 'account_status_changed',
    businessId: id,
    businessName: before?.name ?? null,
    before: { account_status: before?.account_status ?? null },
    after: { account_status: 'active' },
    request: req,
  })

  // Provision TalkMate Command for towing Growth+ clients. The bot record
  // starts as 'pending' — Donna finalises the Telegram token through the
  // admin Command tab. See src/lib/telegram-bot-creator.ts for the
  // rationale (BotFather can't be driven via the bot API).
  let commandBot: { provisioned: boolean; status?: string; manualSetupRequired?: boolean; error?: string } = { provisioned: false }
  const { data: biz } = await admin
    .from('businesses')
    .select('industry, plan, name')
    .eq('id', id)
    .single()
  if (biz && biz.industry === 'towing' && ['growth', 'pro'].includes((biz.plan ?? '').toLowerCase())) {
    const result = await createTelegramBotForClient({
      clientId: id,
      businessName: biz.name ?? 'Client',
    })
    commandBot = {
      provisioned: result.status !== 'failed',
      status: result.status,
      manualSetupRequired: result.manualSetupRequired,
      error: result.error,
    }
  }

  return NextResponse.json({ ok: true, commandBot })
}
