import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: business } = await supabase.from('businesses').select('*').eq('owner_user_id', user.id).single()
  if (!business?.vapi_agent_id) return NextResponse.json({ error: 'No Vapi agent configured' }, { status: 400 })

  const apiKey = process.env.VAPI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'VAPI_API_KEY not configured' }, { status: 500 })

  // Fetch current Vapi assistant — preserve existing prompt, don't rebuild
  const getRes = await fetch('https://api.vapi.ai/assistant/' + business.vapi_agent_id, {
    headers: { 'Authorization': 'Bearer ' + apiKey }
  })
  if (!getRes.ok) return NextResponse.json({ error: 'Failed to fetch Vapi assistant' }, { status: 500 })
  const agent = await getRes.json()

  const currentPrompt: string = agent.model?.systemPrompt || ''
  const currentProvider: string = agent.model?.provider || 'openai'
  const currentModel: string = agent.model?.model || 'gpt-4o'
  const currentTemp: number = agent.model?.temperature ?? 0.5

  let updatedPrompt = currentPrompt
  const fieldsUpdated: string[] = []

  // Recording disclosure — inject or remove based on DB setting
  const disclosureEnabled = business.call_recording_disclosure_enabled !== false
  const disclosureText = (business.call_recording_disclosure_text as string) ||
    'Thank you for calling. This call may be recorded for quality and training purposes.'
  const disclosureLine = `RECORDING DISCLOSURE: At the very start of every call, before saying anything else, say exactly: "${disclosureText}"`

  const hasDisclosure = /RECORDING DISCLOSURE:/i.test(updatedPrompt)
  const hasRecordingMention = /\brecord(ed|ing)\b/i.test(updatedPrompt)

  if (disclosureEnabled && !hasDisclosure && !hasRecordingMention) {
    const firstSectionMatch = updatedPrompt.match(/\n([A-Z][A-Z\s]+:)/)
    if (firstSectionMatch && firstSectionMatch.index !== undefined) {
      updatedPrompt =
        updatedPrompt.slice(0, firstSectionMatch.index + 1) +
        disclosureLine + '\n\n' +
        updatedPrompt.slice(firstSectionMatch.index + 1)
    } else {
      updatedPrompt = disclosureLine + '\n\n' + updatedPrompt
    }
    fieldsUpdated.push('recording_disclosure_added')
  } else if (!disclosureEnabled && hasDisclosure) {
    updatedPrompt = updatedPrompt
      .split('\n')
      .filter(line => !/^RECORDING DISCLOSURE:/i.test(line))
      .join('\n')
    fieldsUpdated.push('recording_disclosure_removed')
  }

  // Build PATCH body — preserve existing model config
  const patchBody: Record<string, unknown> = {
    model: {
      provider: currentProvider,
      model: currentModel,
      systemPrompt: updatedPrompt,
      temperature: currentTemp,
    }
  }

  // Ensure serverUrl and serverUrlSecret are configured
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au'
  const webhookSecret = process.env.VAPI_WEBHOOK_SECRET
  if (!agent.serverUrl) {
    patchBody.serverUrl = appUrl + '/api/webhooks/vapi'
    fieldsUpdated.push('serverUrl')
  }
  if (!agent.serverUrlSecret && webhookSecret) {
    patchBody.serverUrlSecret = webhookSecret
    fieldsUpdated.push('serverUrlSecret')
  }

  if (fieldsUpdated.length === 0) {
    return NextResponse.json({ success: true, message: 'No changes needed', fieldsUpdated: [] })
  }

  const patchRes = await fetch('https://api.vapi.ai/assistant/' + business.vapi_agent_id, {
    method: 'PATCH',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(patchBody),
  })

  if (!patchRes.ok) {
    const err = await patchRes.text()
    return NextResponse.json({ error: 'Vapi PATCH failed: ' + err }, { status: 500 })
  }

  return NextResponse.json({ success: true, fieldsUpdated })
}
