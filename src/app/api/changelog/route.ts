import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// GET — list recent changelog entries.
// POST — mark all current entries as seen for the authenticated user.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ entries: [] })

  const { data } = await supabase
    .from('changelog')
    .select('id, title, description, type, emoji, plan_required, published_at, seen_by')
    .order('published_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ entries: data ?? [] })
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin.from('changelog').select('id, seen_by')
  for (const row of data ?? []) {
    const seen = (row.seen_by ?? []) as string[]
    if (!seen.includes(user.id)) {
      await admin.from('changelog').update({ seen_by: [...seen, user.id] }).eq('id', row.id)
    }
  }
  return NextResponse.json({ ok: true })
}
