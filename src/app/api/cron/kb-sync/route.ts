// GET /api/cron/kb-sync — Vercel cron, every 5 minutes.
//
// Finds every business whose KB has unsynced changes
// (kb_sync_status = 'pending' or 'error') and re-pushes the
// BUSINESS KNOWLEDGE block to its Vapi assistant. The performKbSync
// helper is shared with the user-triggered POST /api/knowledge-base/sync
// route so both paths produce identical Vapi PATCH bodies.

import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { performKbSync } from '@/app/api/knowledge-base/sync/route'

// Bounded per-run fan-out so a giant backlog can't blow the function
// timeout. The cron runs every 5 minutes; up to 25 businesses per run
// covers the entire current fleet plus headroom.
const MAX_PER_RUN = 25

export async function GET(request: Request) {
  const auth = verifyCron(request)
  if (auth) return auth

  const supabase = createAdminClient()

  // Pull pending businesses. We include 'error' so a transient Vapi
  // failure retries on the next run rather than parking forever.
  const { data: pending, error } = await supabase
    .from('businesses')
    .select('id')
    .in('kb_sync_status', ['pending', 'error'])
    .limit(MAX_PER_RUN)

  if (error) {
    console.error('[cron/kb-sync] pending query failed', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const results: Array<{ businessId: string; status: string; entriesSynced: number; detail?: string }> = []
  for (const row of (pending ?? [])) {
    const r = await performKbSync(row.id as string)
    results.push({
      businessId: row.id as string,
      status: r.ok ? r.status : 'error',
      entriesSynced: r.entriesSynced,
      detail: r.detail,
    })
  }

  return NextResponse.json({
    ok: true,
    considered: pending?.length ?? 0,
    results,
  })
}
