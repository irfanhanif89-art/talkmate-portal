import { NextResponse } from 'next/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { sendAdminTelegram } from '@/lib/notifications'
import { toSalesIndustrySlug } from '@/lib/industry-slugs'
import { VAPI_TEMPLATE_IDS, FORBIDDEN_DEMO_PHONE_IDS, ALLOWED_CURRENT_ASSISTANTS } from '@/lib/vapi-template-ids'

const VAPI_BASE = 'https://api.vapi.ai'

export async function POST(req: Request) {
  const auth = await requireSalesRep()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({})) as { industry?: string }
  const slug = toSalesIndustrySlug(body.industry)
  if (!slug) return NextResponse.json({ ok: false, error: 'Unknown industry' }, { status: 400 })

  const templateId = VAPI_TEMPLATE_IDS[slug]
  if (!templateId) return NextResponse.json({ ok: false, error: 'No template configured for industry' }, { status: 400 })

  const phoneNumberId = process.env.VAPI_DEMO_PHONE_NUMBER_ID
  if (!phoneNumberId) return NextResponse.json({ ok: false, error: 'Demo phone not configured' }, { status: 500 })

  if (FORBIDDEN_DEMO_PHONE_IDS.has(phoneNumberId)) {
    return NextResponse.json({ ok: false, error: 'Demo phone misconfigured' }, { status: 500 })
  }

  const apiKey = process.env.VAPI_API_KEY
  if (!apiKey) return NextResponse.json({ ok: false, error: 'Vapi not configured' }, { status: 500 })

  // GET phone-number first — refuse to PATCH if current assistant is not in
  // the template allowlist (defensive guard: prevents accidentally repointing
  // a live client number that happens to share the env var).
  try {
    const getRes = await fetch(`${VAPI_BASE}/phone-number/${phoneNumberId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!getRes.ok) {
      console.error('[launch-demo] GET failed', getRes.status)
      return NextResponse.json({ ok: false, error: 'Demo unavailable. Try again.' }, { status: 502 })
    }
    const phoneData = await getRes.json()
    const currentAssistantId = phoneData?.assistantId as string | undefined
    if (currentAssistantId && !ALLOWED_CURRENT_ASSISTANTS.has(currentAssistantId)) {
      await sendAdminTelegram(
        `Demo phone pointing at unrecognised assistant (${currentAssistantId}). Refused PATCH.`,
      ).catch(() => {})
      return NextResponse.json(
        { ok: false, error: 'Demo phone pointing at unrecognised assistant. Refused PATCH.' },
        { status: 500 },
      )
    }
  } catch (e) {
    console.error('[launch-demo] GET exception', e)
    return NextResponse.json({ ok: false, error: 'Demo unavailable. Try again.' }, { status: 502 })
  }

  try {
    const patchRes = await fetch(`${VAPI_BASE}/phone-number/${phoneNumberId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assistantId: templateId }),
      signal: AbortSignal.timeout(5000),
    })
    if (!patchRes.ok) {
      const txt = await patchRes.text().catch(() => '')
      console.error('[launch-demo] PATCH failed', patchRes.status, txt)
      return NextResponse.json({ ok: false, error: 'Demo unavailable. Try again.' }, { status: 502 })
    }
  } catch (e) {
    console.error('[launch-demo] PATCH exception', e)
    return NextResponse.json({ ok: false, error: 'Demo unavailable. Try again.' }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    success: true,
    demo_number: process.env.NEXT_PUBLIC_DEMO_PHONE_DISPLAY ?? '',
  })
}
