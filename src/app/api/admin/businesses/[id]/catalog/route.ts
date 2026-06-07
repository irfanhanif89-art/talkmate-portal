import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { logAdminAction } from '@/lib/audit'

// Admin catalog list + create for a specific business.
// Service-role client bypasses RLS; scope is enforced via the path's :id
// parameter (catalog_items keys on business_id). This exists because the
// client-side catalog page uses the anon/RLS client, which silently no-ops
// for an admin editing another business's catalog.

const CREATE_FIELDS = new Set([
  'name', 'description', 'price', 'category', 'active',
  'upsell_prompt', 'duration_minutes', 'is_featured', 'sort_order',
])

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('catalog_items')
    .select('*')
    .eq('business_id', id)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, items: data ?? [] })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ ok: false, error: 'name is required.' }, { status: 400 })

  const insert: Record<string, unknown> = { business_id: id }
  for (const k of Object.keys(body)) if (CREATE_FIELDS.has(k)) insert[k] = body[k]
  insert.name = name

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('catalog_items')
    .insert(insert)
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await logAdminAction({
    adminEmail: auth.user.email ?? 'unknown',
    action: 'catalog_item_added',
    businessId: id,
    after: { item_id: data?.id, name: data?.name },
    request,
  })

  return NextResponse.json({ ok: true, item: data })
}
