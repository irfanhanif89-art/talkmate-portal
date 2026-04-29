import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/contacts/search?q=string&exclude=contactId
// Returns contacts whose name or phone contains the query string. Used by
// the contact-merge modal.
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  const exclude = url.searchParams.get('exclude') ?? ''
  if (q.length < 2) return NextResponse.json({ ok: true, contacts: [] })

  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
  if (!business) return NextResponse.json({ ok: false }, { status: 404 })

  let q1 = supabase.from('contacts')
    .select('id, name, phone, call_count, last_seen, tags')
    .eq('client_id', business.id).eq('is_merged', false)
    .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
    .order('last_seen', { ascending: false })
    .limit(20)
  if (exclude) q1 = q1.neq('id', exclude)
  const { data } = await q1
  return NextResponse.json({ ok: true, contacts: data ?? [] })
}
