import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { DEMO_CONTACTS, DEMO_PHONE_PREFIX } from '@/lib/demo-data'
import { seedPipelineStages } from '@/lib/pipeline'

// POST /api/demo/seed
// Body: { businessId: string }
// Admin-only. Seeds 10 demo real-estate contacts plus pipeline placement for
// the specified business. Idempotent — re-running upserts contacts by phone.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { data: userProfile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isSuperAdmin = user.email === process.env.INTERNAL_ALERT_EMAIL || user.email === 'hello@talkmate.com.au'
  if (userProfile?.role !== 'admin' && !isSuperAdmin) {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { businessId?: string }
  const businessId = body.businessId
  if (!businessId) return NextResponse.json({ ok: false, error: 'businessId required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: business } = await admin
    .from('businesses')
    .select('id, industry')
    .eq('id', businessId)
    .single()
  if (!business) return NextResponse.json({ ok: false, error: 'Business not found' }, { status: 404 })

  if (business.industry !== 'real_estate') {
    return NextResponse.json({
      ok: false,
      error: `Demo seeder targets real_estate businesses (this business is ${business.industry ?? 'unconfigured'}).`,
    }, { status: 400 })
  }

  // Make sure the pipeline stages exist before placing contacts.
  await seedPipelineStages(admin, businessId, 'real_estate')
  const { data: stages } = await admin
    .from('pipeline_stages')
    .select('id, stage_name')
    .eq('client_id', businessId)
  const stageByName = new Map<string, string>()
  for (const s of stages ?? []) stageByName.set(s.stage_name as string, s.id as string)

  let contactsUpserted = 0
  let callsInserted = 0
  let pipelineRowsUpserted = 0

  for (const c of DEMO_CONTACTS) {
    // Spread first_seen and last_seen across the past few weeks for a
    // realistic-looking timeline.
    const daysAgo = Math.floor(Math.random() * 21) + 1
    const firstSeen = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
    const lastSeen = new Date(Date.now() - Math.floor(Math.random() * 4) * 24 * 60 * 60 * 1000).toISOString()

    const contactPayload = {
      client_id: businessId,
      name: c.name,
      phone: c.phone,
      first_seen: firstSeen,
      last_seen: lastSeen,
      call_count: c.call_count,
      tags: c.tags,
      industry_data: c.industry_data,
      is_merged: false,
    }

    // Upsert by (client_id, phone) — same key the upsert endpoint uses.
    const { data: existing } = await admin
      .from('contacts')
      .select('id')
      .eq('client_id', businessId)
      .eq('phone', c.phone)
      .maybeSingle()

    let contactId: string
    if (existing) {
      contactId = existing.id as string
      await admin.from('contacts').update(contactPayload).eq('id', contactId)
    } else {
      const { data: inserted, error } = await admin
        .from('contacts')
        .insert(contactPayload)
        .select('id')
        .single()
      if (error || !inserted) {
        console.error('[demo seed] contact insert failed', error)
        continue
      }
      contactId = inserted.id as string
    }
    contactsUpserted++

    // Replace existing call rows for this contact so re-seeding doesn't pile up.
    await admin.from('contact_calls').delete().eq('contact_id', contactId)
    const callRows = c.call_summaries.map((summary, i) => ({
      contact_id: contactId,
      call_id: `demo-${c.phone}-${i}`,
      client_id: businessId,
      call_at: new Date(Date.now() - (i + 1) * 2 * 24 * 60 * 60 * 1000).toISOString(),
      duration_seconds: 90 + Math.floor(Math.random() * 180),
      outcome: 'enquiry_answered',
      summary,
      transcript: null,
      tags_applied: c.tags,
    }))
    if (callRows.length > 0) {
      const { error: callsErr } = await admin.from('contact_calls').insert(callRows)
      if (!callsErr) callsInserted += callRows.length
    }

    // Place into the pipeline stage.
    const stageId = stageByName.get(c.pipeline_stage)
    if (stageId) {
      const { data: existingPipe } = await admin
        .from('contact_pipeline')
        .select('id')
        .eq('contact_id', contactId)
        .maybeSingle()
      if (existingPipe) {
        await admin.from('contact_pipeline').update({
          stage_id: stageId,
          updated_at: new Date().toISOString(),
        }).eq('id', existingPipe.id)
      } else {
        await admin.from('contact_pipeline').insert({
          contact_id: contactId,
          client_id: businessId,
          stage_id: stageId,
          entered_at: firstSeen,
        })
      }
      pipelineRowsUpserted++
    }
  }

  return NextResponse.json({
    ok: true,
    contactsUpserted,
    callsInserted,
    pipelineRowsUpserted,
    phonePrefix: DEMO_PHONE_PREFIX,
  })
}
