import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { refreshSmartListCounts } from '@/lib/smart-lists'

// Called by Make.com after every completed call. Upserts a contact by
// (client_id, phone), bumps call_count + last_seen, applies auto-tags from
// the extracted call data, writes a contact_calls row, and triggers a
// smart-list count refresh.
//
// Auth: requires Bearer ${CRON_SECRET} (same pattern used by other server-to-
// server endpoints). Make.com is trusted; this is not a public endpoint.

interface UpsertRequest {
  client_id: string
  phone: string
  call_id: string
  call_at: string
  duration_seconds: number
  transcript?: string
  summary?: string
  extracted_name?: string | null
  extracted_email?: string | null
  outcome?: string | null
  tags?: string[]
  industry_data?: Record<string, unknown>
}

const PRICE_KEYWORDS = /\b(price|cost|how much|quote|fee|charge|rate)\b/i
const UPSELL_ACCEPTED_KEYWORDS = /\b(yes|sure|ok|alright|sounds good|why not|throw it in|add it|go on)\b/i

// Pipeline auto-movement helper (Session 2 brief Part 4).
// Real estate + trades: first-ever call adds to "New Enquiry".
// Real estate + booking_made: move from "Qualified" → "Inspection Booked",
// or add to "Inspection Booked" if no current stage.
async function maybeUpdatePipeline(
  admin: ReturnType<typeof import('@/lib/supabase/server').createAdminClient>,
  clientId: string,
  contactId: string,
  industry: string | null,
  outcome: string | null,
  isFirstCall: boolean,
) {
  if (!industry || !['real_estate', 'trades'].includes(industry)) return
  const { data: stages } = await admin.from('pipeline_stages').select('id, stage_name').eq('client_id', clientId)
  if (!stages || stages.length === 0) return // Pipeline hasn't been seeded yet for this business.

  const findStage = (name: string) => stages.find(s => s.stage_name === name)?.id as string | undefined

  const { data: existing } = await admin.from('contact_pipeline')
    .select('id, stage_id, pipeline_stages(stage_name)').eq('contact_id', contactId).maybeSingle()
  const existingStageName = (existing as { pipeline_stages?: { stage_name?: string } | null })?.pipeline_stages?.stage_name ?? null

  let targetStageId: string | undefined

  if (industry === 'real_estate' && outcome === 'booking_made' && existingStageName === 'Qualified') {
    targetStageId = findStage('Inspection Booked')
  } else if (industry === 'real_estate' && outcome === 'booking_made' && !existing) {
    targetStageId = findStage('Inspection Booked')
  } else if (isFirstCall && !existing) {
    targetStageId = findStage('New Enquiry')
  }

  if (!targetStageId) return
  const now = new Date().toISOString()
  if (existing) {
    if (existing.stage_id === targetStageId) return
    await admin.from('contact_pipeline').update({ stage_id: targetStageId, entered_at: now, updated_at: now }).eq('id', existing.id)
  } else {
    await admin.from('contact_pipeline').insert({
      contact_id: contactId, client_id: clientId, stage_id: targetStageId, entered_at: now, updated_at: now,
    })
  }
}

function isAfterHoursAEST(callAt: Date): boolean {
  // 8am-6pm AEST window. Brisbane (no DST): UTC+10.
  const hourUtc = callAt.getUTCHours()
  const minuteUtc = callAt.getUTCMinutes()
  const hourAEST = (hourUtc + 10) % 24
  const totalMinutes = hourAEST * 60 + minuteUtc
  return totalMinutes < 8 * 60 || totalMinutes >= 18 * 60
}

export async function POST(req: Request) {
  // CRON_SECRET gates server-to-server calls (Make.com).
  const expectedSecret = process.env.CRON_SECRET
  if (expectedSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  const body = (await req.json().catch(() => null)) as UpsertRequest | null
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })

  const { client_id, phone, call_id, call_at, duration_seconds } = body
  if (!client_id || !phone || !call_id || !call_at) {
    return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 1. Verify the client exists and is active.
  const { data: business } = await admin.from('businesses').select('id, industry').eq('id', client_id).single()
  if (!business) return NextResponse.json({ ok: false, error: 'Client not found' }, { status: 404 })

  const phoneNormalized = phone.replace(/\s+/g, '')

  // 2. Look up existing contact for this client + phone.
  const { data: existing } = await admin.from('contacts')
    .select('*').eq('client_id', client_id).eq('phone', phoneNormalized).eq('is_merged', false).maybeSingle()

  const callTime = new Date(call_at)
  const isFirstCall = !existing
  const newCallCount = (existing?.call_count ?? 0) + 1

  // 3. Build the auto-tag list.
  const incoming = new Set<string>(body.tags ?? [])
  if (isFirstCall) incoming.add('new_caller')
  else incoming.add('repeat_caller')
  if (body.outcome === 'complaint_logged') incoming.add('complaint')
  if (body.transcript && PRICE_KEYWORDS.test(body.transcript)) incoming.add('price_enquiry')
  if (body.transcript && /upsell|add|extra|sides/i.test(body.transcript) && UPSELL_ACCEPTED_KEYWORDS.test(body.transcript)) {
    incoming.add('upsell_accepted')
  }
  if (isAfterHoursAEST(callTime)) incoming.add('after_hours')
  if (newCallCount >= 5) incoming.add('vip_potential')

  const mergedTags = Array.from(new Set([...(existing?.tags ?? []), ...incoming]))

  // 4. Upsert contact.
  let contactId: string
  if (existing) {
    const update: Record<string, unknown> = {
      last_seen: call_at,
      call_count: newCallCount,
      tags: mergedTags,
      updated_at: new Date().toISOString(),
    }
    // Promote name/email if previously unknown and now extracted.
    if (!existing.name && body.extracted_name) update.name = body.extracted_name
    if (!existing.email && body.extracted_email) update.email = body.extracted_email
    // Merge industry_data shallowly.
    if (body.industry_data) {
      update.industry_data = { ...(existing.industry_data ?? {}), ...body.industry_data }
    }
    const { error } = await admin.from('contacts').update(update).eq('id', existing.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    contactId = existing.id
  } else {
    const { data: inserted, error } = await admin.from('contacts').insert({
      client_id,
      phone: phoneNormalized,
      name: body.extracted_name ?? null,
      email: body.extracted_email ?? null,
      first_seen: call_at,
      last_seen: call_at,
      call_count: 1,
      tags: mergedTags,
      industry_data: body.industry_data ?? {},
    }).select('id').single()
    if (error || !inserted) return NextResponse.json({ ok: false, error: error?.message ?? 'Insert failed' }, { status: 500 })
    contactId = inserted.id
  }

  // 5. Insert contact_calls row (idempotent on call_id).
  const { error: callErr } = await admin.from('contact_calls').upsert({
    contact_id: contactId,
    call_id,
    client_id,
    call_at,
    duration_seconds,
    outcome: body.outcome ?? null,
    summary: body.summary ?? null,
    transcript: body.transcript ?? null,
    tags_applied: Array.from(incoming),
  }, { onConflict: 'call_id' })
  if (callErr) {
    console.error('[contacts/upsert] contact_calls insert', callErr)
  }

  // 6. Pipeline auto-movement (Session 2 brief Part 4).
  await maybeUpdatePipeline(admin, client_id, contactId, business.industry, body.outcome ?? null, isFirstCall)

  // 7. Refresh smart-list counts in the background; don't block the response.
  refreshSmartListCounts(admin, client_id).catch(e => console.error('[contacts/upsert] smart-list refresh', e))

  return NextResponse.json({
    ok: true,
    contact_id: contactId,
    is_new: isFirstCall,
    call_count: newCallCount,
    tags: mergedTags,
  })
}
