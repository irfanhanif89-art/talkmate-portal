import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isValidAbnFormat, normaliseAbn } from '@/lib/abn'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as {
    phone?: unknown
    abn?: unknown
    bank_bsb?: unknown
    bank_account_number?: unknown
  }

  // ABN is mandatory and must pass the ATO checksum.
  const abnRaw = typeof body.abn === 'string' ? body.abn : ''
  const abn = normaliseAbn(abnRaw)
  if (!abn || !isValidAbnFormat(abn)) {
    return NextResponse.json(
      { ok: false, error: 'A valid 11-digit ABN is required' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const { data: contractor } = await admin
    .from('contractors')
    .select('id, status, invite_expires_at, agreement_signed_at')
    .eq('invite_token', token)
    .maybeSingle()

  if (!contractor) return NextResponse.json({ ok: false, error: 'Invalid invite link' }, { status: 404 })
  if (contractor.agreement_signed_at) {
    return NextResponse.json({ ok: false, error: 'Agreement already signed' }, { status: 410 })
  }
  if (contractor.invite_expires_at && new Date(contractor.invite_expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: 'Invite link expired' }, { status: 410 })
  }

  const updates: Record<string, unknown> = { abn }
  if ('phone' in body) updates.phone = body.phone ? String(body.phone).trim() : null
  if ('bank_bsb' in body) updates.bank_bsb = body.bank_bsb ? String(body.bank_bsb).trim() : null
  if ('bank_account_number' in body) {
    updates.bank_account_number = body.bank_account_number ? String(body.bank_account_number).trim() : null
  }

  const { error } = await admin.from('contractors').update(updates).eq('id', contractor.id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
