import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  const body = await request.text()

  // Validate HMAC signature
  const secret = process.env.VAPI_WEBHOOK_SECRET
  if (secret) {
    const sig = request.headers.get('x-vapi-signature') || request.headers.get('x-webhook-secret') || ''
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex')
    if (sig !== expected && sig !== `sha256=${expected}`) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  let payload: { message?: { type?: string; call?: Record<string, unknown>; transcript?: string; recordingUrl?: string; summary?: string; toolCallList?: Array<{ function?: { arguments?: string | Record<string, unknown> } }> }; type?: string }
  try { payload = JSON.parse(body) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const eventType = payload.message?.type || payload.type
  const callData = payload.message || payload
  const call = (callData as { call?: Record<string, unknown> }).call || {}
  const callId = (call as { id?: string }).id as string
  const phoneNumber = ((call as { customer?: { number?: string } }).customer?.number) as string | undefined

  if (!callId) return NextResponse.json({ received: true })

  const supabase = createAdminClient()

  // Look up the business by Vapi agent ID
  const { data: business } = await supabase
    .from('businesses')
    .select('id, business_type')
    .eq('vapi_agent_id', (call as { assistantId?: string }).assistantId || '')
    .single()

  if (!business) return NextResponse.json({ received: true })

  if (eventType === 'call.started' || eventType === 'call-start') {
    await supabase.from('calls').upsert({
      id: callId, business_id: business.id,
      started_at: new Date().toISOString(),
      caller_number: phoneNumber,
    }, { onConflict: 'id' })
  }

  if (eventType === 'call.ended' || eventType === 'end-of-call-report') {
    const transcript = (callData as { transcript?: string; summary?: string }).transcript || (callData as { summary?: string }).summary || ''
    const recordingUrl = (callData as { recordingUrl?: string; stereoRecordingUrl?: string }).recordingUrl || (callData as { stereoRecordingUrl?: string }).stereoRecordingUrl || ''
    const duration = call ? Math.round(((new Date((call as { endedAt?: string }).endedAt || '').getTime() || Date.now()) - (new Date((call as { startedAt?: string }).startedAt || '').getTime() || Date.now())) / 1000) : 0

    // Extract outcome from tool calls or summary
    const toolCalls = (callData as { toolCallList?: Array<{ function?: { arguments?: string | Record<string, unknown> } }> }).toolCallList || []
    let outcome = ''
    let extractedData: Record<string, unknown> = {}
    for (const tc of toolCalls) {
      try {
        const args = typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function?.arguments || {}
        if (args.outcome) outcome = args.outcome
        Object.assign(extractedData, args)
      } catch {}
    }

    // Detect outcome from transcript if not in tool calls
    if (!outcome && transcript) {
      const t = transcript.toLowerCase()
      if (t.includes('order') || t.includes('placed')) outcome = 'Order Taken'
      else if (t.includes('appointment') || t.includes('book')) outcome = 'Appointment Booked'
      else if (t.includes('job') || t.includes('dispatch')) outcome = 'Job Dispatched'
      else if (t.includes('transfer')) outcome = 'Transferred'
      else if (t.includes('faq') || t.includes('answered')) outcome = 'FAQ Answered'
    }

    const transferred = outcome === 'Transferred' || (callData as { transferred?: boolean }).transferred === true

    await supabase.from('calls').upsert({
      id: callId, business_id: business.id,
      ended_at: new Date().toISOString(),
      duration_seconds: Math.abs(duration),
      transcript, recording_url: recordingUrl,
      outcome, transferred,
      caller_number: phoneNumber,
    }, { onConflict: 'id' })

    // Write to type-specific table
    const btype = business.business_type
    if (['automotive', 'trades'].includes(btype) && (extractedData.pickupAddress || extractedData.address)) {
      await supabase.from('jobs').insert({
        business_id: business.id, call_id: callId,
        customer_name: extractedData.callerName as string || '',
        customer_phone: phoneNumber || '',
        job_type: extractedData.jobType as string || extractedData.equipment as string || '',
        address: (extractedData.pickupAddress as string || extractedData.address as string || ''),
        urgency: extractedData.urgency as string || 'scheduled',
        status: 'new',
      })
    } else if (['medical', 'beauty', 'fitness', 'professional', 'real_estate'].includes(btype)) {
      await supabase.from('appointments').insert({
        business_id: business.id, call_id: callId,
        customer_name: extractedData.callerName as string || '',
        customer_phone: phoneNumber || '',
        service_type: extractedData.serviceType as string || '',
        scheduled_at: extractedData.preferredDate as string || null,
        status: 'enquired',
      })
    } else if (['hospitality', 'retail'].includes(btype) && extractedData.items) {
      await supabase.from('orders').insert({
        business_id: business.id, call_id: callId,
        items: extractedData.items,
        total_amount: extractedData.totalAmount as number || null,
        status: 'received',
      })
    }

    // Insert notification
    await supabase.from('notifications').insert({
      business_id: business.id,
      type: transferred ? 'call_transferred' : 'call_ended',
      message: `${transferred ? '📞 Call transferred' : '✅ Call ended'}: ${outcome || 'No outcome'} — ${phoneNumber || 'Unknown caller'}`,
    })

    // POST to Make.com webhook
    const makeUrl = process.env.MAKE_WEBHOOK_URL
    if (makeUrl) {
      fetch(makeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: business.id, callId, outcome, transferred, transcript, callerNumber: phoneNumber, extractedData })
      }).catch(() => {})
    }
  }

  if (eventType === 'call.transferred' || eventType === 'transfer-initiated') {
    await supabase.from('calls').update({ transferred: true, outcome: 'Transferred' }).eq('id', callId)
    await supabase.from('notifications').insert({
      business_id: business.id,
      type: 'call_transferred',
      message: `📞 Call transferred from ${phoneNumber || 'Unknown caller'}`,
    })
  }

  return NextResponse.json({ received: true })
}
