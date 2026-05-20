import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Public: validates the invite token and returns enough data to power
// the onboarding flow. Never returns sensitive admin-only fields.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!token) return NextResponse.json({ ok: false, error: 'Missing token', code: 'missing' }, { status: 400 })

  const admin = createAdminClient()
  const { data: contractor } = await admin
    .from('contractors')
    .select('id, first_name, last_name, email, phone, abn, bank_bsb, bank_account_number, status, invite_expires_at, agreement_signed_at')
    .eq('invite_token', token)
    .maybeSingle()

  if (!contractor) {
    return NextResponse.json({ ok: false, error: 'Invalid invite link', code: 'invalid' }, { status: 404 })
  }
  if (contractor.status === 'terminated') {
    return NextResponse.json({ ok: false, error: 'This contractor account has been closed', code: 'terminated' }, { status: 410 })
  }
  if (contractor.agreement_signed_at) {
    return NextResponse.json({
      ok: false,
      error: 'This agreement has already been signed',
      code: 'already_signed',
      contractor: {
        first_name: contractor.first_name,
        email: contractor.email,
      },
    }, { status: 410 })
  }
  if (contractor.invite_expires_at && new Date(contractor.invite_expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: 'This invite link has expired', code: 'expired' }, { status: 410 })
  }

  // Active script (if any) so the UI can show the version on the sign step.
  const { data: activeScript } = await admin
    .from('sales_scripts')
    .select('id, version, title, content, activated_at')
    .eq('is_active', true)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    contractor: {
      id: contractor.id,
      first_name: contractor.first_name,
      last_name: contractor.last_name,
      email: contractor.email,
      phone: contractor.phone,
      abn: contractor.abn,
      bank_bsb: contractor.bank_bsb,
      bank_account_number: contractor.bank_account_number,
      status: contractor.status,
    },
    active_script: activeScript,
  })
}
