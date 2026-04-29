import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// POST /api/admin/partner-update
// Body: { id: string, partner_tier?: string, partner_commission_rate?: number, is_partner?: boolean }
// Used by the inline-edit table on /admin/partners.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { data: userProfile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isSuperAdmin = user.email === process.env.INTERNAL_ALERT_EMAIL || user.email === 'hello@talkmate.com.au'
  if (userProfile?.role !== 'admin' && !isSuperAdmin) {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof body.partner_tier === 'string') {
    if (!['starter', 'silver', 'gold'].includes(body.partner_tier)) {
      return NextResponse.json({ ok: false, error: 'invalid tier' }, { status: 400 })
    }
    update.partner_tier = body.partner_tier
  }
  if (typeof body.partner_commission_rate === 'number') {
    const rate = Math.max(0, Math.min(100, body.partner_commission_rate))
    update.partner_commission_rate = rate
  }
  if (typeof body.is_partner === 'boolean') {
    update.is_partner = body.is_partner
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: 'nothing to update' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('businesses').update(update).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
