import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { BUSINESS_TYPE_CONFIG, type BusinessType } from '@/lib/business-types'
import { seedDefaultSmartLists, type IndustrySlug } from '@/lib/smart-lists'

// Lazy-init so module evaluation doesn't crash at build-time when the key
// isn't injected (Next 16 collects page data at build time without env vars).
function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: business } = await supabase.from('businesses').select('*').eq('owner_user_id', user.id).single()
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const { data: onboarding } = await supabase.from('onboarding_responses').select('responses').eq('business_id', business.id).single()
  const responses = onboarding?.responses || {}
  const config = BUSINESS_TYPE_CONFIG[business.business_type as BusinessType]

  // Build system prompt for Vapi
  const { data: catalogItems } = await supabase.from('catalog_items').select('*').eq('business_id', business.id).eq('active', true)
  const catalogText = (catalogItems || []).map(i => `- ${i.name}${i.price != null ? `: $${i.price}` : ''}${i.description ? `. ${i.description}` : ''}`).join('\n')
  const faqs = (responses.faqs as Array<{ question: string; answer: string }> || []).map((f: { question: string; answer: string }) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')
  const greeting = responses.greeting as string || `Thank you for calling ${business.name}. How can I help you today?`

  const systemPrompt = `You are an AI voice agent for ${business.name}.
Greeting: "${greeting}"
Business type: ${business.business_type}

${config.catalogLabel}:
${catalogText || '(Ask caller what they need)'}

FAQs:
${faqs || '(None configured)'}

Escalation: ${responses.escalationRules || config.escalationTemplate}
${config.complianceRule ? `IMPORTANT: ${config.complianceRule}` : ''}

Always be warm, natural, and helpful. You represent ${business.name} in Australia.`

  // Create Vapi assistant
  const vapiRes = await fetch('https://api.vapi.ai/assistant', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.VAPI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `${business.name} — Talkmate Agent`,
      model: {
        provider: 'openai',
        model: 'gpt-4o',
        systemPrompt,
        temperature: 0.7,
      },
      voice: {
        provider: 'eleven-labs',
        voiceId: responses.voice as string || 'rachel',
      },
      firstMessage: greeting,
    })
  })

  let vapiAgentId = null
  if (vapiRes.ok) {
    const vapiData = await vapiRes.json()
    vapiAgentId = vapiData.id
  }

  // Assign agent to preview number for Irfan to test BEFORE going live
  const PREVIEW_VAPI_PHONE_ID = process.env.PREVIEW_VAPI_PHONE_ID || '1b87ecc7-46d7-47f6-bacd-deba6daec770' // US Vapi number
  const PREVIEW_NUMBER = process.env.PREVIEW_NUMBER || '+19305009961'
  if (vapiAgentId) {
    try {
      await fetch(`https://api.vapi.ai/phone-number/${PREVIEW_VAPI_PHONE_ID}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${process.env.VAPI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assistantId: vapiAgentId }),
      })
    } catch (e) {
      console.error('Preview number assign failed:', e)
    }
  }

  // Pull the new Session-1 fields out of the wizard responses.
  const industry = (responses.industry as IndustrySlug | undefined) ?? null
  const recordingDisclosureEnabled = (responses.recordingDisclosureEnabled as boolean | undefined) ?? true
  const recordingDisclosureText = (responses.recordingDisclosureText as string | undefined)
    ?? 'Thank you for calling. This call may be recorded for quality and business purposes.'

  // Update business — agent pending review, NOT live yet
  await supabase.from('businesses').update({
    onboarding_completed: true,
    ...(industry ? { industry, industry_configured_at: new Date().toISOString() } : {}),
    call_recording_disclosure_enabled: recordingDisclosureEnabled,
    call_recording_disclosure_text: recordingDisclosureText,
    ...(vapiAgentId ? { vapi_agent_id: vapiAgentId, agent_status: 'pending_review', preview_number: PREVIEW_NUMBER } : {}),
  }).eq('id', business.id)

  // Seed default smart lists for this client based on selected industry.
  if (industry) {
    try {
      await seedDefaultSmartLists(createAdminClient(), business.id, industry)
    } catch (e) {
      console.error('[onboarding/complete] seed smart lists failed', e)
    }
  }

  // Notify Irfan on Telegram — agent ready to preview
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8191514620:AAGmr4DitFXG9Wn0U_26FpDyhKNQyMvmotA'
  const TELEGRAM_CHAT_ID = '7809273812'
  const approveUrl = `${process.env.NEXT_PUBLIC_APP_URL}/admin/approve?businessId=${business.id}`
  const telegramMsg = `🎙️ *New agent ready for review*\n\n*Client:* ${business.name}\n*Type:* ${business.business_type}\n*Email:* ${user.email}\n\n*Preview number:* ${PREVIEW_NUMBER}\nCall it now to hear the agent.\n\n[✅ Approve & Go Live](${approveUrl})`
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: telegramMsg, parse_mode: 'Markdown' }),
    })
  } catch (e) {
    console.error('Telegram notify failed:', e)
  }

  const twilioNumber = null // Will be provisioned on approval

  // Mark onboarding complete
  await supabase.from('onboarding_responses').update({ completed_at: new Date().toISOString() }).eq('business_id', business.id)

  // Send welcome email
  try {
    await getResend()?.emails.send({
      from: 'Talkmate <hello@talkmate.com.au>',
      to: user.email!,
      subject: `🎉 You're live on Talkmate — ${business.name}`,
      html: `
        <div style="font-family:Outfit,sans-serif;max-width:600px;margin:0 auto;background:#061322;color:#F2F6FB;padding:40px;border-radius:16px;">
          <div style="text-align:center;margin-bottom:32px">
            <div style="display:inline-flex;align-items:center;gap:12px;">
              <div style="width:48px;height:48px;background:#E8622A;border-radius:12px;display:inline-flex;align-items:center;justify-content:center">
                <span style="color:white;font-size:24px;font-weight:900">T</span>
              </div>
              <span style="font-size:28px;font-weight:800;letter-spacing:-2px;color:white">talk</span><span style="font-size:28px;font-weight:300;letter-spacing:4px;color:#4A9FE8">mate</span>
            </div>
          </div>
          <h1 style="color:white;font-size:28px;margin-bottom:16px">You're live! 🎉</h1>
          <p style="color:#7BAED4;font-size:16px;line-height:1.6;margin-bottom:24px">
            <strong style="color:white">${business.name}</strong> is now connected to Talkmate. Your AI agent is ready to answer calls 24/7.
          </p>
          ${twilioNumber ? `<div style="background:#0A1E38;border:1px solid rgba(232,98,42,0.3);border-radius:12px;padding:24px;margin-bottom:24px">
            <p style="color:#4A7FBB;font-size:13px;margin-bottom:4px">YOUR TALKMATE NUMBER</p>
            <p style="color:white;font-size:28px;font-weight:800;margin-bottom:8px;letter-spacing:1px">${twilioNumber}</p>
            <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0">Forward your existing business number to this number to go live.</p>
          </div>` : ''}
          <div style="background:#0A1E38;border-radius:12px;padding:24px;margin-bottom:24px">
            <p style="color:#4A7FBB;font-size:13px;margin-bottom:8px">NEXT STEPS</p>
            <ul style="color:#F2F6FB;line-height:2">
              <li>Forward your business number to <strong>${twilioNumber || 'your TalkMate number (see dashboard)'}</strong></li>
              <li>Make a test call to hear your AI agent</li>
              <li>Check your dashboard for live call data</li>
            </ul>
          </div>
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="display:inline-block;background:#E8622A;color:white;padding:14px 32px;border-radius:8px;font-weight:700;text-decoration:none">
            Go to Dashboard →
          </a>
          <p style="color:#4A7FBB;font-size:13px;margin-top:32px">Questions? Reply to this email or chat with us at hello@talkmate.com.au</p>
        </div>
      `,
    })
  } catch {}

  // Notify Irfan (admin)
  try {
    await getResend()?.emails.send({
      from: 'Talkmate <hello@talkmate.com.au>',
      to: 'irfanhanif89@gmail.com',
      subject: `🆕 New client live: ${business.name}`,
      html: `<p>New client onboarded: <strong>${business.name}</strong> (${business.business_type})<br>Email: ${user.email}<br>Vapi Agent: ${vapiAgentId || 'Creation failed'}<br>Phone Number: ${twilioNumber || 'Not provisioned'}</p>`,
    })
  } catch {}

  return NextResponse.json({ success: true, vapiAgentId })
}
