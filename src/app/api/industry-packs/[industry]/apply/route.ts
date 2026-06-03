// POST /api/industry-packs/[industry]/apply
// Copies an industry pack's entries into the business's knowledge_base_entries,
// skipping any whose question already exists (app-level dedup — we intentionally
// do NOT rely on a DB unique index, which could fail to build on pre-existing
// duplicate questions). Records the applied pack in businesses.industry_pack_applied,
// and maps onto the EXISTING businesses.industry / trade_type ONLY when they are null
// (never clobbers an admin's existing selection — businesses.industry has its own
// taxonomy: restaurants/towing/real_estate/trades/healthcare/ndis/retail/professional_services/other).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

const ALLOWED = new Set(['towing', 'plumbing', 'electrical', 'cleaning', 'hvac'])

// Pack vertical -> existing businesses.industry umbrella (only set when industry is null).
const INDUSTRY_MAP: Record<string, string> = {
  towing: 'towing',
  plumbing: 'trades',
  electrical: 'trades',
  hvac: 'trades',
  cleaning: 'other',
}
// Pack vertical -> existing businesses.trade_type (migration 020 vocabulary; only set when null).
const TRADE_TYPE_MAP: Record<string, string | null> = {
  plumbing: 'plumber',
  electrical: 'electrician',
  hvac: 'air_conditioning',
  towing: null,
  cleaning: null,
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ industry: string }> },
) {
  const { industry } = await params
  if (!ALLOWED.has(industry)) {
    return NextResponse.json({ ok: false, error: 'unknown_industry' }, { status: 404 })
  }

  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const businessId = auth.businessId

  const admin = createAdminClient()

  // 1. Load pack entries.
  const { data: packEntries, error: packErr } = await admin
    .from('industry_packs')
    .select('category, question, answer, sort_order')
    .eq('industry', industry)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (packErr) return NextResponse.json({ ok: false, error: packErr.message }, { status: 500 })
  if (!packEntries || packEntries.length === 0) {
    return NextResponse.json({ ok: false, error: 'pack_empty' }, { status: 404 })
  }

  // 2. Existing questions for this business (lower-cased) for dedup.
  const { data: existing, error: exErr } = await admin
    .from('knowledge_base_entries')
    .select('question')
    .eq('business_id', businessId)
  if (exErr) return NextResponse.json({ ok: false, error: exErr.message }, { status: 500 })
  const existingSet = new Set((existing ?? []).map((r) => String(r.question).trim().toLowerCase()))

  // 3. Insert only the entries whose question is not already present.
  const toInsert = packEntries
    .filter((e) => !existingSet.has(String(e.question).trim().toLowerCase()))
    .map((e) => ({
      business_id: businessId,
      category: e.category,
      question: e.question,
      answer: e.answer,
      sort_order: e.sort_order,
      is_active: true,
    }))

  let applied = 0
  if (toInsert.length > 0) {
    const { error: insErr, count } = await admin
      .from('knowledge_base_entries')
      .insert(toInsert, { count: 'exact' })
    if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 })
    applied = count ?? toInsert.length
  }
  const skipped = packEntries.length - applied

  // 4. Record the applied pack + back-fill industry/trade_type when empty.
  const { data: biz } = await admin
    .from('businesses')
    .select('industry, trade_type')
    .eq('id', businessId)
    .maybeSingle()

  const update: Record<string, unknown> = { industry_pack_applied: industry }
  if (biz && (biz.industry === null || biz.industry === undefined)) {
    update.industry = INDUSTRY_MAP[industry]
  }
  const tradeType = TRADE_TYPE_MAP[industry]
  if (tradeType && biz && (biz.trade_type === null || biz.trade_type === undefined)) {
    update.trade_type = tradeType
  }
  await admin.from('businesses').update(update).eq('id', businessId)
  // The migration-061 trigger flips kb_sync_status to 'pending' on KB insert,
  // so the existing kb-sync cron will push the new entries to Vapi automatically.

  return NextResponse.json({
    ok: true,
    applied,
    skipped,
    message: `${applied} ${applied === 1 ? 'entry' : 'entries'} added to your knowledge base.`,
  })
}
