import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/audit'

const ALLOWED_FIELDS = new Set([
  'name', 'description', 'price', 'category', 'active',
  'upsell_prompt', 'duration_minutes', 'is_featured', 'sort_order',
])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id, itemId } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  for (const k of Object.keys(body)) if (ALLOWED_FIELDS.has(k)) update[k] = body[k]

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('catalog_items')
    .update(update)
    .eq('id', itemId)
    .eq('business_id', id)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: 'Item not found' }, { status: 404 })

  await logAdminAction({
    adminEmail: auth.user.email ?? 'unknown',
    action: 'catalog_item_updated',
    businessId: id,
    after: { item_id: itemId, ...update },
    request,
  })

  return NextResponse.json({ ok: true, item: data })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id, itemId } = await params
  const admin = createAdminClient()
  const { data: before } = await admin
    .from('catalog_items')
    .select('name')
    .eq('id', itemId)
    .eq('business_id', id)
    .maybeSingle()

  const { error } = await admin
    .from('catalog_items')
    .delete()
    .eq('id', itemId)
    .eq('business_id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await logAdminAction({
    adminEmail: auth.user.email ?? 'unknown',
    action: 'catalog_item_removed',
    businessId: id,
    before: { item_id: itemId, ...(before ?? {}) },
    request,
  })

  return NextResponse.json({ ok: true })
}
