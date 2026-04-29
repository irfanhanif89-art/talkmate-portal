import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { resolveSmartList, type FilterRules } from '@/lib/smart-list-resolver'

// POST /api/smart-lists — create a custom smart list for the current business.
// GET  /api/smart-lists — list all smart lists for the current business.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { data: business } = await supabase.from('businesses').select('id, industry').eq('owner_user_id', user.id).single()
  if (!business) return NextResponse.json({ ok: false }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    name?: string; description?: string; icon?: string; color?: string
    filter_rules?: FilterRules
  }
  const name = (body.name ?? '').trim()
  if (!name) return NextResponse.json({ ok: false, error: 'Name required' }, { status: 400 })

  const admin = createAdminClient()
  // Compute initial count so the card shows a real number immediately.
  const { total } = await resolveSmartList(admin, business.id, body.filter_rules ?? {}, { limit: 1 })

  const { data, error } = await admin.from('smart_lists').insert({
    client_id: business.id,
    name,
    description: body.description ?? null,
    filter_rules: body.filter_rules ?? {},
    is_system: false,
    industry: business.industry ?? null,
    icon: body.icon ?? '⭐',
    color: body.color ?? '#1565C0',
    contact_count: total,
    last_refreshed_at: new Date().toISOString(),
  }).select('id').single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { data } = await supabase
    .from('smart_lists')
    .select('id, name, description, icon, color, is_system, contact_count, last_refreshed_at, filter_rules')
    .order('is_system', { ascending: false })
    .order('name', { ascending: true })

  return NextResponse.json({ ok: true, lists: data ?? [] })
}
