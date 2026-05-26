import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { BUSINESS_TYPE_CONFIG, type BusinessType } from '@/lib/business-types'
import { seedDefaultSmartLists, type IndustrySlug } from '@/lib/smart-lists'
import { buildNewAgentPayload } from '@/lib/vapi-agent-builder'

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

  // Session 28 (H9) — build a complete, validator-clean Vapi payload.
  // The old hand-rolled body used voice.provider='eleven-labs' (wrong
  // — Vapi expects '11labs'), shipped no voice model, no
  // stopSpeakingPlan, no transcriber config, and zero tools. Every
  // new client agent failed validateAgentConfig on day one and Donna
  // had to fix each one by hand. The builder uses
  // AGENT_CONFIG_STANDARD for every config value.
  const vapiPayload = buildNewAgentPayload({
    businessName: business.name,
    businessId: business.id,
    systemPrompt,
    firstMessage: greeting,
    voiceId: typeof responses.voice === 'string' ? responses.voice : undefined,
    plan: (business.plan as string | undefined) ?? 'starter',
  })
  const vapiRes = await fetch('https://api.vapi.ai/assistant', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.VAPI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(vapiPayload),
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

  // Session 42 (H8) — persist the preview phoneNumber UUID so that if a
  // preview-stage business is suspended before approval (e.g. fraud),
  // unassignVapiPhone() can still PATCH the binding. After approval the
  // production Twilio number's UUID overwrites this in provisionAgent().
  if (vapiAgentId) {
    await supabase
      .from('businesses')
      .update({ vapi_phone_number_id: PREVIEW_VAPI_PHONE_ID })
      .eq('id', business.id)
  }

  // Pull the new Session-1 fields out of the wizard responses.
  const industry = (responses.industry as IndustrySlug | undefined) ?? null
  const recordingDisclosureEnabled = (responses.recordingDisclosureEnabled as boolean | undefined) ?? true
  const recordingDisclosureText = (responses.recordingDisclosureText as string | undefined)
    ?? 'Thank you for calling. This call may be recorded for quality and business purposes.'

  // Pull the optional ABN out of the onboarding responses. Strip non-digits
  // before persisting so the column always stores the canonical 11-digit form.
  const abnRaw = typeof responses.abn === 'string' ? responses.abn : ''
  const abn = abnRaw.replace(/\D/g, '').slice(0, 11)

  // Update business — agent pending review, NOT live yet
  await supabase.from('businesses').update({
    onboarding_completed: true,
    ...(industry ? { industry, industry_configured_at: new Date().toISOString() } : {}),
    ...(abn.length === 11 ? { abn } : {}),
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

  // Notify Irfan on Telegram — agent ready to preview.
  // Env vars must be set in Vercel; no source fallback.
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID
  const approveUrl = `${process.env.NEXT_PUBLIC_APP_URL}/admin/approve?businessId=${business.id}`
  const telegramMsg = `🎙️ *New agent ready for review*\n\n*Client:* ${business.name}\n*Type:* ${business.business_type}\n*Email:* ${user.email}\n\n*Preview number:* ${PREVIEW_NUMBER}\nCall it now to hear the agent.\n\n[✅ Approve & Go Live](${approveUrl})`
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: telegramMsg, parse_mode: 'Markdown' }),
      })
    } catch (e) {
      console.error('Telegram notify failed:', e)
    }
  } else {
    console.error('[onboarding/complete] TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID missing — skipping notify')
  }

  const twilioNumber = null // Will be provisioned on approval

  // Mark onboarding complete
  await supabase.from('onboarding_responses').update({ completed_at: new Date().toISOString() }).eq('business_id', business.id)

  // Session 30 — the "You're live" welcome email used to fire here, but
  // onboarding completion only means the form is filled out. The real
  // go-live moment is when an admin approves the agent and Twilio
  // provisioning succeeds, so the welcome email now fires from
  // /api/admin/approve-agent (non-override path only).

  // Notify Irfan (admin). ADMIN_EMAIL or INTERNAL_ALERT_EMAIL must be set in Vercel.
  const adminEmail = process.env.ADMIN_EMAIL || process.env.INTERNAL_ALERT_EMAIL
  if (adminEmail) {
    try {
      await getResend()?.emails.send({
        from: 'Talkmate <hello@talkmate.com.au>',
        to: adminEmail,
        subject: `🆕 New client live: ${business.name}`,
        html: `<p>New client onboarded: <strong>${business.name}</strong> (${business.business_type})<br>Email: ${user.email}<br>Vapi Agent: ${vapiAgentId || 'Creation failed'}<br>Phone Number: ${twilioNumber || 'Not provisioned'}</p>`,
      })
    } catch {}
  }

  return NextResponse.json({ success: true, vapiAgentId })
}
