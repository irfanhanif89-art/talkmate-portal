// Session 4A (Round 1) — admin applies industry intake questions to a client.
// Writes call_flow_questions (draft store). Round 1 does NOT sync to the prompt.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { intakeQuestionsFor } from '@/lib/onboarding-intel'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: biz } = await supabase.from('businesses').select('industry').eq('id', id).maybeSingle()
  const industry = (biz as { industry: string | null } | null)?.industry ?? 'other'

  const defaults = intakeQuestionsFor(industry)
  await supabase.from('call_flow_questions').delete().eq('business_id', id)
  const rows = defaults.map((q, i) => ({
    business_id: id, question: q.question, purpose: q.purpose, sort_order: i, is_active: true,
  }))
  const { error } = await supabase.from('call_flow_questions').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('businesses').update({ industry_mode_set: true }).eq('id', id)
  return NextResponse.json({ ok: true, applied: rows.length, industry })
}
