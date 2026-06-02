import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { isCommissionPlan } from '@/lib/commission'
import { sendProposalForLead, type TemplateType } from '@/lib/proposal-send'
import { ROI_DEFAULTS } from '@/lib/proposal/roi'

export async function POST(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({})) as {
    lead_id?: string
    plan?: string
    personalised_note?: string
    template_type?: string
    missed_calls_per_week?: number
    avg_job_value?: number
    hours_per_week?: number
  }

  if (!body.lead_id) return NextResponse.json({ ok: false, error: 'lead_id required' }, { status: 400 })
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
  const { data: lead } = await admin
    .from('leads')
    .select('id, assigned_to, business_name, contact_name, email, industry, status')
    .eq('id', body.lead_id)
    .maybeSingle()

  if (!lead || lead.assigned_to !== auth.rep.id) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
  }
  if (!lead.email) {
    return NextResponse.json({ ok: false, error: 'Lead has no email on file' }, { status: 400 })
  }

  const result = await sendProposalForLead({
    lead: {
      id: lead.id,
      business_name: lead.business_name,
      contact_name: lead.contact_name,
      email: lead.email,
      industry: lead.industry,
      status: lead.status,
    },
    rep: {
      id: auth.rep.id,
      full_name: auth.rep.full_name,
      phone: auth.rep.phone,
      notification_email: auth.rep.notification_email ?? auth.rep.email,
    },
    plan: body.plan,
    templateType,
    personalisedNote,
    roi,
  })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true, proposal_id: result.proposalId })
}
