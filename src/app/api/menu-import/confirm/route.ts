import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface ImportedItem {
  name: string
  price: number | null
  category: string
  description?: string
}

// POST /api/menu-import/confirm { items: ImportedItem[] }
// Inserts the chosen items into catalog_items for the current business.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
  if (!business) return NextResponse.json({ ok: false }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { items?: ImportedItem[] }
  const items = Array.isArray(body.items) ? body.items.filter(i => i && i.name) : []
  if (items.length === 0) return NextResponse.json({ ok: false, error: 'No items' }, { status: 400 })

  const { data: existing } = await supabase.from('catalog_items').select('id').eq('business_id', business.id)
  const baseSort = (existing?.length ?? 0)

  const rows = items.map((it, i) => ({
    business_id: business.id,
    name: it.name,
    description: it.description ?? null,
    price: it.price ?? null,
    category: it.category ?? 'Other',
    active: true,
    sort_order: baseSort + i,
  }))

  const { error } = await supabase.from('catalog_items').insert(rows)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, inserted: rows.length })
}
