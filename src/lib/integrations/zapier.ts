// Zapier outbound webhook. When a call ends, POST a structured payload to the
// client-configured catch hook. This single integration unlocks 5,000+ apps.
//
// No auth/secret to store — the hook URL itself is the credential, so it is
// kept in plain text (it is per-business and revocable by the client).

import type { IntegrationBusiness, IntegrationCall } from './types'

export interface ZapierPayload {
  event: 'call_ended'
  timestamp: string
  business: { id: string; name: string | null; phone: string | null }
  call: {
    id: string
    caller_number: string | null
    duration_seconds: number | null
    outcome: string | null
    intelligence_score: number | null
    was_abandoned: boolean | null
    winback_sent: boolean | null
    transcript_summary: string | null
    started_at: string | null
    ended_at: string | null
    booking_created: boolean
  }
}

export function buildZapierPayload(
  business: IntegrationBusiness,
  call: IntegrationCall,
  nowIso: string,
): ZapierPayload {
  return {
    event: 'call_ended',
    timestamp: nowIso,
    business: {
      id: business.id,
      name: business.name ?? null,
      phone: business.talkmate_number ?? null,
    },
    call: {
      id: call.id,
      caller_number: call.caller_number ?? null,
      duration_seconds: call.duration_seconds ?? null,
      outcome: call.outcome ?? null,
      // NOTE: intelligence_score is scored asynchronously AFTER the webhook
      // returns, so it is typically null at fire time. Present for forward-compat.
      intelligence_score: call.intelligence_score ?? null,
      was_abandoned: call.was_abandoned ?? null,
      winback_sent: call.winback_sent ?? null,
      transcript_summary: call.transcript ? call.transcript.slice(0, 500) : null,
      started_at: call.started_at ?? null,
      ended_at: call.ended_at ?? null,
      booking_created: call.booking_id != null,
    },
  }
}

/** Fire-and-forget POST to the client's Zapier hook. Never throws to the caller. */
export async function fireZapierWebhook(
  business: IntegrationBusiness,
  call: IntegrationCall,
  nowIso: string,
): Promise<void> {
  if (!business.zapier_webhook_url) return
  const payload = buildZapierPayload(business, call, nowIso)
  const res = await fetch(business.zapier_webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    console.error(`[zapier] webhook returned ${res.status}`)
  }
}
