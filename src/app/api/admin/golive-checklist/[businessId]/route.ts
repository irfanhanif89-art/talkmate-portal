import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import {
  computeAutoChecks,
  AUTO_CHECK_KEYS,
  MANUAL_CHECK_KEYS,
  type ManualCheckKey,
} from '@/lib/golive-checks'

// Session 20 — Go-Live Verification API (admin only).
//
// GET  recomputes every auto check, upserts the result, returns the
//      full checklist + pass counts.
// PATCH accepts manual check toggles and the notes field. Auto checks
//      cannot be set here — they're always computed server-side. After
//      saving, if every auto and manual check passes, the business is
//      marked golive_verified.

// Brief refers to a single ADMIN_EMAIL env var. The portal already has
// requireAdmin() (users.role === 'admin' OR known super-admin emails).
// We use that helper so this route stays consistent with every other
// /api/admin/* endpoint.

export const dynamic = 'force-dynamic'

interface ChecklistRow {
  id: string
  business_id: string
  created_at: string
  updated_at: string
  verified_at: string | null
  verified_by: string | null
  [key: string]: unknown
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { businessId } = await params
  const admin = createAdminClient()

  // 1. Recompute auto checks against the live data.
  const { business, result: autoResult } = await computeAutoChecks(admin, businessId)
  if (!business) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  // 2. Upsert the auto check columns into client_golive_checklist. A
  //    seed insert lives in the migration so the row should exist; we
  //    upsert defensively in case the business was created after seeding.
  const upsertPayload: Record<string, unknown> = {
    business_id: businessId,
    updated_at: new Date().toISOString(),
    ...autoResult,
  }
  const { data: upserted, error: upsertErr } = await admin
    .from('client_golive_checklist')
    .upsert(upsertPayload, { onConflict: 'business_id' })
    .select('*')
    .maybeSingle()

  if (upsertErr || !upserted) {
    return NextResponse.json({ error: upsertErr?.message ?? 'Upsert failed' }, { status: 500 })
  }

  const checklist = upserted as ChecklistRow

  // 3. Roll up counts.
  let autoPass = 0
  for (const k of AUTO_CHECK_KEYS) if (checklist[k] === true) autoPass++

  let manualPass = 0
  for (const k of MANUAL_CHECK_KEYS) if (checklist[k] === true) manualPass++

  const autoTotal = AUTO_CHECK_KEYS.length
  const manualTotal = MANUAL_CHECK_KEYS.length
  const isFullyVerified = autoPass === autoTotal && manualPass === manualTotal

  return NextResponse.json({
    checklist,
    business: {
      id: business.id,
      // Frontend expects `business_name` per the brief; map from `name`.
      business_name: business.name,
      plan: business.plan,
      account_status: business.account_status,
    },
    autoPassCount: autoPass,
    autoTotalCount: autoTotal,
    manualPassCount: manualPass,
    manualTotalCount: manualTotal,
    isFullyVerified,
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { businessId } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  // Strict allow-list — only manual_* keys + notes are mutable.
  const patch: Record<string, unknown> = {}
  for (const k of MANUAL_CHECK_KEYS as readonly string[]) {
    if (typeof body[k] === 'boolean') patch[k] = body[k]
  }
  if (typeof body.notes === 'string') patch.notes = (body.notes as string).slice(0, 4000)

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  patch.updated_at = new Date().toISOString()

  const admin = createAdminClient()

  // Ensure the checklist row exists before updating.
  await admin
    .from('client_golive_checklist')
    .upsert({ business_id: businessId }, { onConflict: 'business_id', ignoreDuplicates: true })

  const { data, error } = await admin
    .from('client_golive_checklist')
    .update(patch)
    .eq('business_id', businessId)
    .select('*')
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 })
  }

  // After saving the manual update, recompute auto checks. If everything
  // now passes, stamp the verified fields and flip businesses.golive_verified.
  const { result: autoResult, business } = await computeAutoChecks(admin, businessId)
  const merged: ChecklistRow = { ...(data as ChecklistRow), ...autoResult }

  const autoAllPass = AUTO_CHECK_KEYS.every(k => merged[k] === true)
  const manualAllPass = MANUAL_CHECK_KEYS.every(k => merged[k as ManualCheckKey] === true)
  const isFullyVerified = autoAllPass && manualAllPass

  const nowIso = new Date().toISOString()
  const adminEmail = auth.user.email ?? 'admin'

  await admin
    .from('client_golive_checklist')
    .update({
      ...autoResult,
      verified_at: isFullyVerified ? nowIso : null,
      verified_by: isFullyVerified ? adminEmail : null,
      updated_at: nowIso,
    })
    .eq('business_id', businessId)

  await admin
    .from('businesses')
    .update({
      golive_verified: isFullyVerified,
      golive_verified_at: isFullyVerified ? nowIso : null,
    })
    .eq('id', businessId)

  // Re-fetch the canonical row so the client sees exactly what's stored.
  const { data: final } = await admin
    .from('client_golive_checklist')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle()

  let autoPass = 0, manualPass = 0
  const finalRow = (final ?? merged) as ChecklistRow
  for (const k of AUTO_CHECK_KEYS) if (finalRow[k] === true) autoPass++
  for (const k of MANUAL_CHECK_KEYS) if (finalRow[k] === true) manualPass++

  return NextResponse.json({
    checklist: finalRow,
    business: {
      id: business?.id ?? businessId,
      business_name: business?.name ?? null,
      plan: business?.plan ?? null,
      account_status: business?.account_status ?? null,
    },
    autoPassCount: autoPass,
    autoTotalCount: AUTO_CHECK_KEYS.length,
    manualPassCount: manualPass,
    manualTotalCount: MANUAL_CHECK_KEYS.length,
    isFullyVerified,
  })
}
