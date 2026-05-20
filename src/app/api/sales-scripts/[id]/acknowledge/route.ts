import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Public-but-authenticated: the contractor passes their invite_token
// as a Bearer token (the same token used during onboarding). The
// contractor must already be in 'signed' or 'active' status.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ ok: false, error: 'Missing bearer token' }, { status: 401 })

  const admin = createAdminClient()
  const { data: contractor } = await admin
    .from('contractors')
    .select('id, status')
    .eq('invite_token', token)
    .maybeSingle()
  if (!contractor) return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 })
  if (contractor.status !== 'signed' && contractor.status !== 'active') {
    return NextResponse.json({ ok: false, error: 'Contractor is not active' }, { status: 403 })
  }

  const { data: script } = await admin
    .from('sales_scripts')
    .select('id, version')
    .eq('id', id)
    .maybeSingle()
  if (!script) return NextResponse.json({ ok: false, error: 'Script not found' }, { status: 404 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const acknowledged_at = new Date().toISOString()

  const { error } = await admin
    .from('script_acknowledgements')
    .upsert(
      {
        contractor_id: contractor.id,
        script_id: script.id,
        script_version: script.version,
        acknowledged_at,
        acknowledged_ip: ip,
      },
      { onConflict: 'contractor_id,script_id' }
    )
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, acknowledged_at })
}
