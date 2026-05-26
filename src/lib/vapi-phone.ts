// H8 (Session 42) — Vapi entitlement deprovision via phoneNumber.
//
// When a TalkMate subscription transitions to cancelled / expired /
// suspended, we PATCH the Vapi phoneNumber resource to set
// assistantId = null. The assistant itself is NEVER touched: model,
// voice, transcriber, tools, server URL, knowledge base, custom
// variables — all preserved. Reactivation re-binds the assistantId.
//
// This is "Lever 2" in the H8 decision document. PATCHing firstMessage
// or silenceTimeoutSeconds (Lever 1) is cosmetic — the call still
// connects and still bills per Vapi minute. Lever 2 is the only
// mechanism that actually stops calls being answered for a deprovisioned
// customer.
//
// Backed by businesses.vapi_phone_number_id (migration 050). For
// existing live customers the UUID is backfilled by migration 050
// directly; for new onboardings it is captured at the
// provisionAgent() call site (src/lib/provisioning/approveAgent.ts).

import { createAdminClient } from '@/lib/supabase/server'
import { sendAdminTelegram } from '@/lib/notifications'

export type UnassignReason = 'cancelled' | 'expired' | 'suspended' | 'manual'

interface BusinessRow {
  id: string
  name: string | null
  vapi_agent_id: string | null
  vapi_phone_number_id: string | null
  vapi_phone_unassigned_at: string | null
}

interface VapiPhoneResult {
  success: boolean
  skipped?: boolean
  error?: string
}

/**
 * Unbind a business's Vapi phoneNumber from its assistant. After this
 * runs, Vapi will route incoming calls to the no-assistant fallback
 * (silence-then-disconnect by default). The assistant itself is not
 * modified.
 *
 * Idempotent: if vapi_phone_unassigned_at is already set, no-op.
 * Safe: if vapi_phone_number_id is null (e.g. legacy customer with no
 *   captured UUID), no-op rather than throwing.
 */
export async function unassignVapiPhone(
  businessId: string,
  reason: UnassignReason,
): Promise<VapiPhoneResult> {
  const supabase = createAdminClient()

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name, vapi_agent_id, vapi_phone_number_id, vapi_phone_unassigned_at')
    .eq('id', businessId)
    .maybeSingle<BusinessRow>()

  if (!biz) return { success: false, error: 'business not found' }
  if (!biz.vapi_phone_number_id) return { success: true, skipped: true }
  if (biz.vapi_phone_unassigned_at) return { success: true, skipped: true }

  try {
    const res = await fetch(`https://api.vapi.ai/phone-number/${biz.vapi_phone_number_id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assistantId: null }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Vapi PATCH ${res.status}: ${text.slice(0, 200)}`)
    }

    await supabase
      .from('businesses')
      .update({
        vapi_phone_unassigned_at: new Date().toISOString(),
        vapi_phone_unassigned_reason: reason,
      })
      .eq('id', businessId)

    await sendAdminTelegram(
      `Vapi phone unassigned for ${biz.name ?? 'Unknown'} (reason: ${reason}).`,
    ).catch(() => {})

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[vapi-phone] unassign failed', { businessId, reason, message })
    await sendAdminTelegram(
      `FAILED to unassign Vapi phone for ${biz.name ?? 'Unknown'} (${reason}): ${message}. Manual action required.`,
    ).catch(() => {})
    return { success: false, error: message }
  }
}

/**
 * Re-bind a business's Vapi phoneNumber to its assistant on reactivation.
 * The assistant body is never modified — only phoneNumber.assistantId.
 *
 * Idempotent: if vapi_phone_unassigned_at is null, no-op.
 */
export async function reassignVapiPhone(businessId: string): Promise<VapiPhoneResult> {
  const supabase = createAdminClient()

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name, vapi_agent_id, vapi_phone_number_id, vapi_phone_unassigned_at')
    .eq('id', businessId)
    .maybeSingle<BusinessRow>()

  if (!biz) return { success: false, error: 'business not found' }
  if (!biz.vapi_phone_number_id) return { success: true, skipped: true }
  if (!biz.vapi_phone_unassigned_at) return { success: true, skipped: true }
  if (!biz.vapi_agent_id) {
    return { success: false, error: 'no vapi_agent_id on business to reassign to' }
  }

  try {
    const res = await fetch(`https://api.vapi.ai/phone-number/${biz.vapi_phone_number_id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assistantId: biz.vapi_agent_id }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Vapi PATCH ${res.status}: ${text.slice(0, 200)}`)
    }

    await supabase
      .from('businesses')
      .update({
        vapi_phone_unassigned_at: null,
        vapi_phone_unassigned_reason: null,
      })
      .eq('id', businessId)

    await sendAdminTelegram(
      `Vapi phone reassigned for ${biz.name ?? 'Unknown'} (reactivated).`,
    ).catch(() => {})

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[vapi-phone] reassign failed', { businessId, message })
    await sendAdminTelegram(
      `FAILED to reassign Vapi phone for ${biz.name ?? 'Unknown'}: ${message}. Manual action required.`,
    ).catch(() => {})
    return { success: false, error: message }
  }
}
