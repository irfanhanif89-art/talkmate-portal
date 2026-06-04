// Session 4A (Round 1) — call_flow_questions CRUD for the Train > Call Flow tab.
// Draft-only in Round 1: these are stored but NOT injected into the agent
// prompt yet (that is Round 2). No KB sync is triggered here.

import { NextResponse } from 'next/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { createAdminClient } from '@/lib/supabase/server'
import { intakeQuestionsFor } from '@/lib/onboarding-intel'

export const runtime = 'nodejs'

async function resolve(req: Request) {
  const url = new URL(req.url)
  return resolveBusinessId(url.searchParams.get('adminClientId'), req)
}

export async function GET(req: Request) {
  const r = await resolve(req)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('call_flow_questions')
    .select('id, question, purpose, sort_order, is_active')
    .eq('business_id', r.businessId)
    .order('sort_order', { ascending: true })
  return NextResponse.json({ questions: data ?? [] })
}

export async function POST(req: Request) {
  const r = await resolve(req)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  let body: { question?: string; purpose?: string; action?: string; industry?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }
  const supabase = createAdminClient()

  // "Reload [industry] defaults" — replace this business's questions with the preset.
  if (body.action === 'reload_defaults') {
    const defaults = intakeQuestionsFor(body.industry)
    await supabase.from('call_flow_questions').delete().eq('business_id', r.businessId)
    const rows = defaults.map((q, i) => ({
      business_id: r.businessId, question: q.question, purpose: q.purpose, sort_order: i, is_active: true,
    }))
    const { data } = await supabase.from('call_flow_questions').insert(rows).select('id, question, purpose, sort_order, is_active')
    return NextResponse.json({ questions: data ?? [] })
  }

  if (!body.question?.trim()) return NextResponse.json({ error: 'question required' }, { status: 400 })
  const { count } = await supabase.from('call_flow_questions').select('id', { count: 'exact', head: true }).eq('business_id', r.businessId)
  const { data, error } = await supabase.from('call_flow_questions').insert({
    business_id: r.businessId, question: body.question.trim(), purpose: body.purpose?.trim() || null, sort_order: count ?? 0, is_active: true,
  }).select('id, question, purpose, sort_order, is_active').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ question: data })
}

export async function PATCH(req: Request) {
  const r = await resolve(req)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  let body: { id?: string; question?: string; purpose?: string; order?: { id: string; sort_order: number }[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }
  const supabase = createAdminClient()

  // Bulk reorder.
  if (body.order) {
    await Promise.all(body.order.map(o =>
      supabase.from('call_flow_questions').update({ sort_order: o.sort_order }).eq('id', o.id).eq('business_id', r.businessId),
    ))
    return NextResponse.json({ ok: true })
  }

  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (body.question !== undefined) patch.question = body.question.trim()
  if (body.purpose !== undefined) patch.purpose = body.purpose.trim() || null
  await supabase.from('call_flow_questions').update(patch).eq('id', body.id).eq('business_id', r.businessId)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const r = await resolve(req)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createAdminClient()
  await supabase.from('call_flow_questions').delete().eq('id', id).eq('business_id', r.businessId)
  return NextResponse.json({ ok: true })
}
