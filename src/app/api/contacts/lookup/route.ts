import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// Called by Vapi webhook when a call starts — looks up caller by phone number
// Returns contact info to inject into agent context
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get('phone')
  const businessId = searchParams.get('businessId')

  if (!phone || !businessId) {
    return NextResponse.json({ found: false, error: 'Missing phone or businessId' }, { status: 400 })
  }

  // Normalize phone — strip spaces/dashes, ensure +61 format
  const normalized = normalizePhone(phone)
  if (!normalized) {
    return NextResponse.json({ found: false })
  }

  const supabase = await createAdminClient()

  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('business_id', businessId)
    .eq('phone', normalized)
    .single()

  if (!contact) {
    return NextResponse.json({ found: false, phone: normalized })
  }

  // Build agent context string for Vapi system prompt injection
  const history = (contact.service_history as Array<{date: string; type: string; description: string; amount?: string}>) || []
  const lastJob = history[0]

  const agentContext = contact ? {
    found: true,
    name: contact.name,
    email: contact.email,
    company: contact.company,
    jobCount: history.length,
    lastJob: lastJob ? {
      date: lastJob.date,
      type: lastJob.type,
      description: lastJob.description,
      amount: lastJob.amount,
    } : null,
    aiContext: contact.ai_context,
    // Ready-to-use greeting for Vapi
    suggestedGreeting: lastJob
      ? `G'day ${contact.name?.split(' ')[0] || ''}! Good to hear from you again. Last time we helped you with ${lastJob.type}${lastJob.date ? ` back on ${new Date(lastJob.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}` : ''}. What can I help you with today?`
      : `G'day ${contact.name?.split(' ')[0] || ''}! Good to hear from you. How can I help you today?`,
  } : { found: false }

  return NextResponse.json(agentContext)
}

function normalizePhone(phone: string): string | null {
  // Remove all non-digits except leading +
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, '')

  // Already E.164
  if (cleaned.startsWith('+61')) return cleaned

  // Australian mobile starting with 04
  if (cleaned.startsWith('04')) return '+61' + cleaned.slice(1)

  // Australian landline starting with 0
  if (cleaned.startsWith('0')) return '+61' + cleaned.slice(1)

  // International without +
  if (cleaned.startsWith('61')) return '+' + cleaned

  // 9-digit number (missing leading 0)
  if (cleaned.length === 9) return '+61' + cleaned

  return null
}
