import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
  if (!business) return NextResponse.json({ ok: false }, { status: 404 })

  const { data: contacts } = await supabase
    .from('contacts')
    .select('name, phone, email, tags, call_count, first_seen, last_seen, notes, industry_data')
    .eq('client_id', business.id)
    .eq('is_merged', false)
    .order('last_seen', { ascending: false })

  const headers = ['name', 'phone', 'email', 'tags', 'call_count', 'first_seen', 'last_seen', 'notes', 'industry_data']
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'string' ? v : Array.isArray(v) ? v.join('; ') : JSON.stringify(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const rows = [
    headers.join(','),
    ...((contacts ?? []).map(c => headers.map(h => escape((c as Record<string, unknown>)[h])).join(','))),
  ].join('\n')

  return new Response(rows, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="talkmate-contacts.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
