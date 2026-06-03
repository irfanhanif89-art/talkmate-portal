// GET /api/industry-packs/[industry]
// Returns all active entries for an industry, grouped by category.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

const ALLOWED = new Set(['towing', 'plumbing', 'electrical', 'cleaning', 'hvac'])

export async function GET(
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

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('industry_packs')
    .select('id, category, question, answer, sort_order')
    .eq('industry', industry)
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const grouped: Record<string, { id: string; question: string; answer: string; sort_order: number }[]> = {}
  for (const row of data ?? []) {
    const cat = row.category as string
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push({
      id: row.id as string,
      question: row.question as string,
      answer: row.answer as string,
      sort_order: row.sort_order as number,
    })
  }

  return NextResponse.json({ ok: true, industry, count: (data ?? []).length, grouped })
}
