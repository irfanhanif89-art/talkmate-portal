import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { BUSINESS_TYPE_CONFIG, type BusinessType } from '@/lib/business-types'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: business } = await supabase.from('businesses').select('*').eq('owner_user_id', user.id).single()
  if (!business?.vapi_agent_id) return NextResponse.json({ error: 'No Vapi agent configured' }, { status: 400 })

  const { data: catalogItems } = await supabase.from('catalog_items').select('*').eq('business_id', business.id).eq('active', true).order('sort_order')
  const config = BUSINESS_TYPE_CONFIG[business.business_type as BusinessType]

  // Industry-specific contact data extraction instructions (Session 1 brief Part 7).
  const industry = business.industry as string | null
  const industrySpecificInstructions = (() => {
    switch (industry) {
      case 'restaurants': return 'For restaurant: also extract order items, order total value, order type (pickup/delivery/dine-in), delivery address if given.'
      case 'towing': return 'For towing: also extract vehicle make/model/year if mentioned, breakdown location, issue description.'
      case 'real_estate': return 'For real estate: also extract enquiry type (buy/rent/sell/appraisal), budget range if mentioned, pre-approval status, property address or area of interest, suburb preferences.'
      case 'trades': return 'For trades: also extract type of job, urgency level (emergency/urgent/standard), property address if given.'
      default: return ''
    }
  })()

  const contactDataBlock = `
CONTACT DATA COLLECTION INSTRUCTIONS:
At the start of every call, listen for the caller's name. If they introduce themselves or give their name at any point, note it.

At the end of every call, your response metadata must include a structured summary in this exact format:
CALL_SUMMARY_START
caller_name: [name if given, UNKNOWN if not]
call_purpose: [one sentence]
call_outcome: [order_placed/booking_made/enquiry_answered/callback_requested/complaint_logged/transfer_to_human/no_resolution]
follow_up_required: [true/false]
CALL_SUMMARY_END

${industrySpecificInstructions}`.trim()

  const recordingDisclosure = business.call_recording_disclosure_enabled === false
    ? ''
    : `\n\nAt the very start of the call, before anything else, say: "${business.call_recording_disclosure_text || 'Thank you for calling. This call may be recorded for quality and business purposes.'}"`

  const catalogText = (catalogItems || []).map(item => {
    let line = `- ${item.name}`
    if (item.category) line += ` (${item.category})`
    if (item.price != null) line += `: $${item.price}`
    if (item.duration_minutes) line += ` — ${item.duration_minutes} min`
    if (item.description) line += `. ${item.description}`
    if (item.is_featured) line += ' ⭐ FEATURED — mention proactively'
    if (item.upsell_prompt) line += `. UPSELL: ${item.upsell_prompt}`
    return line
  }).join('\n')

  const systemPrompt = `You are an AI voice agent for ${business.name}, a ${business.business_type} business in Australia.${recordingDisclosure}

${config.catalogLabel}:
${catalogText || '(No items configured yet)'}

Your role: ${config.dashboardMetricLabel.replace(' Today', '').toLowerCase()}.
Primary goal: ${config.primaryMetric}.

Escalation rules:
${business.escalation_rules || config.escalationTemplate}
${config.complianceRule ? `\nIMPORTANT: ${config.complianceRule}` : ''}

${contactDataBlock}

Always be friendly, professional, and concise. You represent ${business.name}.`

  const res = await fetch(`https://api.vapi.ai/assistant/${business.vapi_agent_id}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${process.env.VAPI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: { systemPrompt } })
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: `Vapi error: ${err}` }, { status: 500 })
  }

  return NextResponse.json({ success: true, itemsSynced: (catalogItems || []).length })
}
