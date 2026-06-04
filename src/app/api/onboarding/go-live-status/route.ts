// Session 4A (Round 1) — client go-live readiness status.
// GET returns the 5-item checklist + completion percent. Recomputes the
// KB-count flag on every call. Does NOT touch the Stripe/Payment step.

import { NextResponse } from 'next/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { createAdminClient } from '@/lib/supabase/server'
import { getGoLiveStatus, markGateItem } from '@/lib/onboarding-gate'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const adminClientId = url.searchParams.get('adminClientId')
  const resolved = await resolveBusinessId(adminClientId, req)
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const supabase = createAdminClient()
  const status = await getGoLiveStatus(supabase, resolved.businessId)
  return NextResponse.json(status)
}

// POST flips a stored gate flag. Used by the VIP "no VIP callers" tick and the
// VIP page-visit signal. Body: { item: 'vipReviewed' | ..., value?: boolean }.
export async function POST(req: Request) {
  const url = new URL(req.url)
  const adminClientId = url.searchParams.get('adminClientId')
  const resolved = await resolveBusinessId(adminClientId, req)
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  let body: { item?: string; value?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }

  const map: Record<string, 'agent_named' | 'mode_selected' | 'vip_callers_reviewed' | 'announcement_sent'> = {
    agentNamed: 'agent_named',
    modeSelected: 'mode_selected',
    vipReviewed: 'vip_callers_reviewed',
    announcementSent: 'announcement_sent',
  }
  const col = body.item ? map[body.item] : undefined
  if (!col) return NextResponse.json({ error: 'unknown item' }, { status: 400 })

  const supabase = createAdminClient()
  await markGateItem(supabase, resolved.businessId, { [col]: body.value ?? true })
  const status = await getGoLiveStatus(supabase, resolved.businessId)
  return NextResponse.json(status)
}
