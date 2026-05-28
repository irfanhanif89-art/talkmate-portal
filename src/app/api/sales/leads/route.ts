import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'

// Session 27 (H22) — sales rep can create their own lead.
//
// Schema notes (migration 036):
//   leads.business_name TEXT NOT NULL
//   leads.contact_name / phone / email / industry / suburb / state / website / notes (nullable)
//   leads.status defaults to 'new' if omitted (but we set it explicitly)
//   leads.assigned_to references sales_reps(id) — we stamp this with the
//     calling rep, never trust the request body.
//   leads.assigned_by references auth.users(id).

// Lead columns mobile + web both consume. Kept narrow to minimise payload.
const LEAD_SELECT = `
  id, business_name, contact_name, phone, email, industry, suburb, state,
  website, source, notes, status, approval_status,
  won_plan, won_billing_cycle, won_at,
  lost_reason, bad_lead_reason, business_id,
  next_followup_at, created_at, updated_at, assigned_to
`

const ALLOWED_SOURCES = new Set([
  'cold_call', 'referral', 'walk_in', 'online', 'other',
])

export async function GET(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const url = new URL(req.url)
  const includeBadLead = url.searchParams.get('include') === 'bad_lead'
  const statusFilter = url.searchParams.get('status')

  const admin = createAdminClient()
  let query = admin
    .from('leads')
    .select(LEAD_SELECT)
    .eq('assigned_to', auth.rep.id)
    .order('updated_at', { ascending: false })
    .limit(500)

  if (!includeBadLead) {
    query = query.neq('status', 'bad_lead')
  }
  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  const { data: leads, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, leads: leads ?? [] })
}

export async function POST(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as {
    business_name?: unknown
    contact_name?: unknown
    phone?: unknown
    email?: unknown
    industry?: unknown
    suburb?: unknown
    state?: unknown
    website?: unknown
    notes?: unknown
    source?: unknown
  }

  const businessName = typeof body.business_name === 'string' ? body.business_name.trim() : ''
  const contactName = typeof body.contact_name === 'string' ? body.contact_name.trim() : ''
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const industry = typeof body.industry === 'string' ? body.industry.trim() : ''
  const suburb = typeof body.suburb === 'string' ? body.suburb.trim() : ''
  const state = typeof body.state === 'string' ? body.state.trim() : ''
  const website = typeof body.website === 'string' ? body.website.trim() : ''
  const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
  const source = typeof body.source === 'string' ? body.source.trim().toLowerCase() : ''

  if (!businessName) {
    return NextResponse.json({ ok: false, error: 'Business name is required.' }, { status: 400 })
  }
  if (!contactName) {
    return NextResponse.json({ ok: false, error: 'Contact name is required.' }, { status: 400 })
  }
  if (!phone) {
    return NextResponse.json({ ok: false, error: 'Contact phone is required.' }, { status: 400 })
  }
  if (source && !ALLOWED_SOURCES.has(source)) {
    return NextResponse.json({ ok: false, error: 'Source must be cold_call, referral, walk_in, online, or other.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const insert: Record<string, unknown> = {
    business_name: businessName,
    contact_name: contactName,
    phone,
    status: 'new',
    assigned_to: auth.rep.id,
    assigned_by: auth.user.id,
  }
  if (email) insert.email = email
  if (industry) insert.industry = industry
  if (suburb) insert.suburb = suburb
  if (state) insert.state = state
  if (website) insert.website = website
  if (notes) insert.notes = notes
  if (source) insert.source = source

  const { data: lead, error } = await admin
    .from('leads')
    .insert(insert)
    .select(`
      id, business_name, contact_name, phone, email, industry, suburb, state,
      website, source, notes, status, approval_status, won_plan, won_at,
      lost_reason, bad_lead_reason, business_id, created_at, updated_at, assigned_to
    `)
    .single()

  if (error || !lead) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Could not create lead' }, { status: 500 })
  }

  // Audit trail.
  await admin.from('lead_activities').insert({
    lead_id: lead.id,
    rep_id: auth.rep.id,
    activity_type: 'system',
    title: 'Lead created by rep',
    body: source ? `Source: ${source}` : null,
  })

  return NextResponse.json({ ok: true, lead })
}
