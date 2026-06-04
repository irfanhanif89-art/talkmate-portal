import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { DEMO_INDUSTRIES } from '@/lib/demo-config'

export const dynamic = 'force-dynamic'

// Industries that have a live demo behind them. Only these may be written to
// sales_reps.demo_industry — setting a non-live key would point the rep's demo
// portal at an industry with no demo business (404). The UI disables the rest.
const AVAILABLE_DEMO_INDUSTRIES = new Map(
  DEMO_INDUSTRIES.filter((i) => i.available).map((i) => [i.key as string, i.label]),
)

// Bulk-imports leads from a CSV-parsed payload and assigns them to a
// single sales rep. Called by the /admin/leads-import page after the
// admin has uploaded a sheet, mapped columns, and picked a rep.
//
// Schema (migration 036):
//   leads.business_name TEXT NOT NULL
//   leads.assigned_to UUID REFERENCES sales_reps(id)
//   leads.assigned_by UUID REFERENCES auth.users(id)
//   leads.status default 'new', approval_status default 'pending'
//   All other fields nullable; we let the client send only what was mapped.

const ALLOWED_SOURCES = new Set(['cold_call', 'referral', 'walk_in', 'online', 'other'])

interface ImportRow {
  business_name?: string
  contact_name?: string | null
  phone?: string | null
  email?: string | null
  industry?: string | null
  suburb?: string | null
  state?: string | null
  website?: string | null
  notes?: string | null
}

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as {
    rep_id?: unknown
    industry?: unknown
    source?: unknown
    rows?: unknown
  }

  const repId = typeof body.rep_id === 'string' ? body.rep_id.trim() : ''
  const industryDefault = typeof body.industry === 'string' ? body.industry.trim() : ''
  const sourceRaw = typeof body.source === 'string' ? body.source.trim().toLowerCase() : ''
  const source = sourceRaw && ALLOWED_SOURCES.has(sourceRaw) ? sourceRaw : 'online'

  if (!repId) return NextResponse.json({ ok: false, error: 'rep_id is required' }, { status: 400 })
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ ok: false, error: 'No rows to import' }, { status: 400 })
  }
  if (body.rows.length > 5000) {
    return NextResponse.json({ ok: false, error: 'Max 5000 rows per import' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Confirm the rep exists and is active so we don't silently assign
  // leads to a terminated or non-existent rep.
  const { data: rep } = await admin
    .from('sales_reps')
    .select('id, status, full_name, email, demo_industry')
    .eq('id', repId)
    .maybeSingle()
  if (!rep) return NextResponse.json({ ok: false, error: 'Sales rep not found' }, { status: 404 })
  if (rep.status !== 'active') {
    return NextResponse.json({ ok: false, error: `Cannot assign leads to a ${rep.status} rep` }, { status: 400 })
  }

  const rows = body.rows as ImportRow[]
  const errors: Array<{ row: number; reason: string }> = []
  const toInsert: Record<string, unknown>[] = []

  rows.forEach((r, idx) => {
    const business_name = typeof r.business_name === 'string' ? r.business_name.trim() : ''
    if (!business_name) {
      errors.push({ row: idx + 1, reason: 'business_name is required' })
      return
    }
    const insert: Record<string, unknown> = {
      business_name,
      assigned_to: repId,
      assigned_by: auth.user.id,
      status: 'new',
      source,
    }
    const optional: Array<[keyof ImportRow, string]> = [
      ['contact_name', 'contact_name'],
      ['phone', 'phone'],
      ['email', 'email'],
      ['industry', 'industry'],
      ['suburb', 'suburb'],
      ['state', 'state'],
      ['website', 'website'],
      ['notes', 'notes'],
    ]
    for (const [k, col] of optional) {
      const v = r[k]
      if (typeof v === 'string' && v.trim() !== '') insert[col] = v.trim()
    }
    if (!insert.industry && industryDefault) insert.industry = industryDefault
    toInsert.push(insert)
  })

  if (toInsert.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'No valid rows', errors },
      { status: 400 },
    )
  }

  // Insert in chunks so we don't blow Supabase's batch limits on big sheets.
  const CHUNK = 500
  let inserted = 0
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK)
    const { data, error } = await admin
      .from('leads')
      .insert(chunk)
      .select('id')
    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: `Insert failed at row ${i + 1}: ${error.message}`,
          inserted,
          errors,
        },
        { status: 500 },
      )
    }
    inserted += data?.length ?? 0
  }

  // Wire the chosen industry into the rep's demo setup. Picking a live demo
  // industry switches the rep's demo portal + demo agent to match the pack we
  // just gave them. Only live demo keys are written (UI disables the rest).
  let demoIndustryLabel: string | null = null
  if (industryDefault && AVAILABLE_DEMO_INDUSTRIES.has(industryDefault)) {
    if (rep.demo_industry !== industryDefault) {
      const { error: demoErr } = await admin
        .from('sales_reps')
        .update({ demo_industry: industryDefault })
        .eq('id', repId)
      if (demoErr) {
        // Non-fatal: leads imported fine; surface but don't fail the import.
        console.error('[bulk-import] demo_industry update error', demoErr)
      } else {
        demoIndustryLabel = AVAILABLE_DEMO_INDUSTRIES.get(industryDefault) ?? industryDefault
        await admin.from('admin_audit_log').insert({
          admin_email: auth.user.email,
          action: 'rep_demo_industry_updated',
          before_value: { rep_id: repId, rep_email: rep.email, demo_industry: rep.demo_industry, via: 'leads_import' },
          after_value: { rep_id: repId, rep_email: rep.email, demo_industry: industryDefault, via: 'leads_import' },
        })
      }
    } else {
      // Already set to this industry — report it so the admin gets confirmation.
      demoIndustryLabel = AVAILABLE_DEMO_INDUSTRIES.get(industryDefault) ?? industryDefault
    }
  }

  return NextResponse.json({
    ok: true,
    inserted,
    skipped: errors.length,
    errors,
    rep_name: rep.full_name,
    demo_industry_label: demoIndustryLabel,
  })
}
