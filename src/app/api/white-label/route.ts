import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { canHideTalkmateBranding } from '@/lib/white-label'

// POST /api/white-label
// Upserts the partner's white-label config. Only callable by businesses
// where is_partner = true.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { data: business } = await supabase
    .from('businesses')
    .select('id, is_partner, partner_tier')
    .eq('owner_user_id', user.id)
    .single()
  if (!business) return NextResponse.json({ ok: false, error: 'No business' }, { status: 404 })
  if (!business.is_partner) return NextResponse.json({ ok: false, error: 'Not a partner account' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  const brandName = String(body.brand_name ?? '').trim()
  if (!brandName) {
    return NextResponse.json({ ok: false, error: 'Brand name is required' }, { status: 400 })
  }

  // Only Gold partners can flip hide_talkmate_branding to true. Other tiers
  // are forced to false regardless of what was sent.
  const allowHide = canHideTalkmateBranding(business.partner_tier)
  const hideBranding = allowHide ? Boolean(body.hide_talkmate_branding) : false

  const update: Record<string, unknown> = {
    partner_id: business.id,
    brand_name: brandName,
    brand_logo_url: body.brand_logo_url ?? null,
    primary_color: body.primary_color ?? '#E8622A',
    secondary_color: body.secondary_color ?? '#061322',
    accent_color: body.accent_color ?? '#1565C0',
    support_email: body.support_email ?? null,
    support_phone: body.support_phone ?? null,
    hide_talkmate_branding: hideBranding,
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('white_label_configs')
    .select('id')
    .eq('partner_id', business.id)
    .maybeSingle()

  if (existing) {
    const { error } = await admin.from('white_label_configs').update(update).eq('id', existing.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: existing.id })
  }

  const { data, error } = await admin
    .from('white_label_configs')
    .insert({ ...update, is_active: false })
    .select('id')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}
