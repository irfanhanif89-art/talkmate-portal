import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyCron } from '@/lib/cron-auth'
import { createSystemAlert } from '@/lib/alerts'

// Brief Part 12. Runs daily 9:00am AEST (= 23:00 UTC).
// For each active client, fires a silent test call via Vapi and flags any
// where the agent failed to answer.
export async function GET(req: Request) {
  const guard = verifyCron(req); if (guard) return guard
  const apiKey = process.env.VAPI_API_KEY
  const testAssistantId = process.env.VAPI_TEST_ASSISTANT_ID
  if (!apiKey) return NextResponse.json({ ok: false, error: 'VAPI_API_KEY missing' }, { status: 500 })
  if (!testAssistantId) return NextResponse.json({ ok: true, skipped: true, reason: 'VAPI_TEST_ASSISTANT_ID not configured' })

  const supabase = createAdminClient()
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, owner_user_id, talkmate_number')
    .not('talkmate_number', 'is', null)

  const stats = { tested: 0, failed: 0, errors: [] as string[] }

  for (const b of businesses ?? []) {
    stats.tested++
    try {
      const res = await fetch('https://api.vapi.ai/call', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantId: testAssistantId,
          customer: { number: b.talkmate_number },
          metadata: { type: 'call_forward_check', businessId: b.id },
        }),
      })

      const ok = res.ok
      const status = ok ? 'ok' : 'failed'
      await supabase.from('businesses').update({
        last_call_forward_check: new Date().toISOString(),
        call_forward_status: status,
      }).eq('id', b.id)

      if (!ok) {
        stats.failed++
        await createSystemAlert(supabase, {
          userId: b.owner_user_id,
          businessId: b.id,
          type: 'call_forward_broken',
          severity: 'warning',
          message: `Daily call-forward test failed for ${b.name}. Check phone forwarding settings.`,
        })
      }
    } catch (e) {
      stats.errors.push(`${b.id}: ${(e as Error).message}`)
    }
  }

  return NextResponse.json({ ok: true, ...stats })
}
