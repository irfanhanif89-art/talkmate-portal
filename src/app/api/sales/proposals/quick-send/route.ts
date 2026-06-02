import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { isCommissionPlan } from '@/lib/commission'
import { toSalesIndustrySlug } from '@/lib/industry-slugs'
import { sendProposalForLead, type TemplateType } from '@/lib/proposal-send'
import { ROI_DEFAULTS } from '@/lib/proposal/roi'

// Standalone proposal send. The rep enters a fresh client email (plus
// business name + industry) and we auto-generate and send the branded
// proposal — without needing an existing lead. To keep everything tracked
// and attributable, this creates a lead in the rep's pipeline (or reuses
// the rep's existing lead for that email) before sending, so the proposal
// shows up in their pipeline and stays closeable later.

export async function POST(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  if (!auth.rep.notification_email) {
    return NextResponse.json(
      { ok: false, error: 'Set your reply-to email in Profile first.' },
      { status: 400 },
    )
  }

  const body = await req.json().catch(() => ({})) as {
    business_name?: string
    contact_name?: string
    email?: string
    industry?: string
    plan?: string
    template_type?: string
    personalised_note?: string
    missed_calls_per_week?: number
    avg_job_value?: number
    hours_per_week?: number
  }

  const businessName = (body.business_name ?? '').trim()
  const contactName = (body.contact_name ?? '').trim()
  const email = (body.email ?? '').trim()
  const industrySlug = toSalesIndustrySlug(body.industry)

  if (!businessName) {
    return NextResponse.json({ ok: false, error: 'Business name is required.' }, { status: 400 })
  }
  if (!/\S+@\S+\.\S+/.test(email)) {
    return NextResponse.json({ ok: false, error: 'A valid client email is required.' }, { status: 400 })
  }
  if (!isCommissionPlan(body.plan)) {
    return NextResponse.json({ ok: false, error: 'plan must be starter, growth, or pro' }, { status: 400 })
  }
  const templateType: TemplateType = body.template_type === 'post_demo' ? 'post_demo' : 'full'
  const personalisedNote = (body.personalised_note ?? '').trim().slice(0, 200) || null
  const roi = {
    missedCallsPerWeek: Number(body.missed_calls_per_week) || ROI_DEFAULTS.missedCallsPerWeek,
    avgJobValue: Number(body.avg_job_value) || ROI_DEFAULTS.avgJobValue,
    hoursPerWeek: Number(body.hours_per_week) || ROI_DEFAULTS.hoursPerWeek,
  }

  const admin = createAdminClient()

  // Reuse this rep's existing lead for the same email if one exists, so a
  // rep re-sending to a known contact doesn't spawn duplicate pipeline rows.
  const { data: existing } = await admin
    .from('leads')
    .select('id, business_name, contact_name, email, industry, status')
    .eq('assigned_to', auth.rep.id)
    .ilike('email', email)
    .maybeSingle()

  let lead = existing as {
    id: string
    business_name: string
    contact_name: string | null
    email: string | null
    industry: string | null
    status: string
  } | null

  if (!lead) {
    const insert: Record<string, unknown> = {
      business_name: businessName,
      email,
      status: 'new',
      assigned_to: auth.rep.id,
      assigned_by: auth.user.id,
      source: 'other',
    }
    if (contactName) insert.contact_name = contactName
    if (industrySlug) insert.industry = industrySlug

    const { data: created, error: insertErr } = await admin
      .from('leads')
      .insert(insert)
      .select('id, business_name, contact_name, email, industry, status')
      .single()

    if (insertErr || !created) {
      return NextResponse.json(
        { ok: false, error: insertErr?.message ?? 'Could not create lead for proposal.' },
        { status: 500 },
      )
    }
    lead = created

    await admin.from('lead_activities').insert({
      lead_id: lead.id,
      rep_id: auth.rep.id,
      activity_type: 'system',
      title: 'Lead created via standalone proposal',
    })
  }

  const result = await sendProposalForLead({
    lead: {
      id: lead.id,
      business_name: lead.business_name,
      contact_name: lead.contact_name,
      email,
      industry: lead.industry ?? industrySlug,
      status: lead.status,
    },
    rep: {
      id: auth.rep.id,
      full_name: auth.rep.full_name,
      phone: auth.rep.phone,
      notification_email: auth.rep.notification_email,
    },
    plan: body.plan,
    templateType,
    personalisedNote,
    roi,
  })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true, proposal_id: result.proposalId, lead_id: lead.id })
}
