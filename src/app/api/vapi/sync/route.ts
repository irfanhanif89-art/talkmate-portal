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

  const systemPrompt = `You are an AI voice agent for ${business.name}, a ${business.business_type} business in Australia.

${config.catalogLabel}:
${catalogText || '(No items configured yet)'}

Your role: ${config.dashboardMetricLabel.replace(' Today', '').toLowerCase()}.
Primary goal: ${config.primaryMetric}.

Escalation rules:
${business.escalation_rules || config.escalationTemplate}
${config.complianceRule ? `\nIMPORTANT: ${config.complianceRule}` : ''}

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
