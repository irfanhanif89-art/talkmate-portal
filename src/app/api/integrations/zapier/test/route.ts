// POST /api/integrations/zapier/test — session auth (or ?adminClientId)
// Sends a sample payload to the saved Zapier hook so the client can confirm it.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { buildZapierPayload } from '@/lib/integrations/zapier'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses')
    .select('id, name, talkmate_number, zapier_webhook_url')
    .eq('id', auth.businessId)
    .maybeSingle()

  const url = (biz?.zapier_webhook_url as string | null) ?? null
  if (!url) return NextResponse.json({ ok: false, error: 'No Zapier webhook URL saved yet.' }, { status: 400 })

  const sample = buildZapierPayload(
    { id: biz!.id as string, name: (biz!.name as string) ?? null, talkmate_number: (biz!.talkmate_number as string) ?? null, zapier_webhook_url: url },
    {
      id: 'sample-call-id',
      caller_number: '+61400000000',
      duration_seconds: 142,
      outcome: 'completed',
      intelligence_score: null,
      was_abandoned: false,
      winback_sent: false,
      transcript: 'This is a sample TalkMate call payload sent by the Test button.',
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      booking_id: null,
    },
    new Date().toISOString(),
  )

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...sample, test: true }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return NextResponse.json({ ok: false, error: `Zapier returned ${res.status}` }, { status: 200 })
    await admin.from('businesses').update({ zapier_last_triggered_at: new Date().toISOString() }).eq('id', auth.businessId)
    return NextResponse.json({ ok: true, status: res.status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 200 })
  }
}
