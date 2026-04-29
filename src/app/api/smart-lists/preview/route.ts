import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveSmartList, type FilterRules } from '@/lib/smart-list-resolver'

// Session 2 brief Part 9 — live count for the custom-list builder.
// Body: { rules: FilterRules }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
  if (!business) return NextResponse.json({ ok: false }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { rules?: FilterRules }
  const rules = body.rules ?? {}

  const { total } = await resolveSmartList(supabase, business.id, rules, { limit: 1 })
  return NextResponse.json({ ok: true, count: total })
}
