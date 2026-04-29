import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// Called by Vapi webhook when a call starts. Looks up caller by phone for the
// given business and returns context the agent can use to greet returning
// callers by name. Updated for the Session 1 v2 contacts schema (client_id).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get('phone')
  // Accept either businessId (legacy callers) or client_id (new callers).
  const clientId = searchParams.get('businessId') ?? searchParams.get('client_id')

  if (!phone || !clientId) {
    return NextResponse.json({ found: false, error: 'Missing phone or businessId' }, { status: 400 })
  }

  const normalized = normalizePhone(phone)
  if (!normalized) {
    return NextResponse.json({ found: false })
  }

  const supabase = createAdminClient()

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, name, email, call_count, last_seen, tags, industry_data')
    .eq('client_id', clientId)
    .eq('phone', normalized)
    .eq('is_merged', false)
    .maybeSingle()

  if (!contact) {
    return NextResponse.json({ found: false, phone: normalized })
  }

  // Pull the most recent contact_calls entry for "last interaction" context.
  const { data: lastCallRow } = await supabase
    .from('contact_calls')
    .select('call_at, outcome, summary')
    .eq('contact_id', contact.id)
    .order('call_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const firstName = contact.name?.split(' ')[0] || ''
  const callCount = contact.call_count ?? 0
  const lastDate = lastCallRow?.call_at
    ? new Date(lastCallRow.call_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })
    : null

  const suggestedGreeting = (() => {
    if (callCount <= 1) return `G'day${firstName ? ` ${firstName}` : ''}, thanks for calling. How can I help you today?`
    if (lastDate && lastCallRow?.outcome) {
      return `G'day${firstName ? ` ${firstName}` : ''}, good to hear from you again. Last time we spoke on ${lastDate} about ${lastCallRow.outcome.replace(/_/g, ' ')}. What can I help you with today?`
    }
    return `G'day${firstName ? ` ${firstName}` : ''}, good to hear from you again. What can I help you with today?`
  })()

  return NextResponse.json({
    found: true,
    name: contact.name,
    email: contact.email,
    callCount,
    tags: contact.tags ?? [],
    industryData: contact.industry_data ?? {},
    lastInteraction: lastCallRow ? {
      date: lastCallRow.call_at,
      outcome: lastCallRow.outcome,
      summary: lastCallRow.summary,
    } : null,
    suggestedGreeting,
  })
}

function normalizePhone(phone: string): string | null {
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, '')
  if (cleaned.startsWith('+61')) return cleaned
  if (cleaned.startsWith('04')) return '+61' + cleaned.slice(1)
  if (cleaned.startsWith('0')) return '+61' + cleaned.slice(1)
  if (cleaned.startsWith('61')) return '+' + cleaned
  if (cleaned.length === 9) return '+61' + cleaned
  return null
}
