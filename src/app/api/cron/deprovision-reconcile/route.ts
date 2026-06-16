// Deprovision reconcile — safety net for the cancel/expire/suspend → Vapi
// shut-off flow (Session 42 H8). The dedicated /cancel route, the Stripe
// webhook, the expire-trials cron, and (now) the admin status-edit PATCH all
// call unassignVapiPhone() directly. This hourly sweep catches anything that
// slipped through — a direct DB edit, a failed Vapi PATCH, an old row — so a
// non-live account can never keep an agent online (and billable).
//
// Finds businesses that are cancelled/expired/suspended, still have a Vapi
// phone-number id, but were never unassigned, and unbinds them. unassignVapiPhone
// is idempotent + Telegram-alerts on success/failure, so this is safe to run
// repeatedly.

import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { unassignVapiPhone, type UnassignReason } from '@/lib/vapi-phone'

export const maxDuration = 60

export async function GET(req: Request) {
  const denied = verifyCron(req)
  if (denied) return denied

  const supabase = createAdminClient()

  const { data: stragglers, error } = await supabase
    .from('businesses')
    .select('id, name, account_status')
    .in('account_status', ['cancelled', 'expired', 'suspended'])
    .not('vapi_phone_number_id', 'is', null)
    .is('vapi_phone_unassigned_at', null)

  if (error) {
    return NextResponse.json({ status: 'error', detail: error.message }, { status: 500 })
  }

  const list = stragglers ?? []
  let fixed = 0
  const failures: string[] = []

  for (const b of list) {
    try {
      const res = await unassignVapiPhone(b.id as string, b.account_status as UnassignReason)
      if (res.success && !res.skipped) fixed++
      else if (!res.success) failures.push(`${b.name ?? b.id}: ${res.error ?? 'unknown'}`)
    } catch (e) {
      console.error('[deprovision-reconcile] threw for', b.id, (e as Error).message)
      failures.push(`${b.name ?? b.id}: ${(e as Error).message}`)
    }
  }

  // unassignVapiPhone already Telegram-alerts each fix/failure individually; we
  // only escalate a summary if multiple straggled (signals a flow regression).
  return NextResponse.json({
    status: 'ok',
    candidates: list.length,
    fixed,
    failures,
  })
}
