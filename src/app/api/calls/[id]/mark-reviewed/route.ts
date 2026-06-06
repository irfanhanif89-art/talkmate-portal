// PATCH /api/calls/[id]/mark-reviewed
//
// Clears the "needs review" flag on a flagged call from the mobile Insights
// screen. Bearer (or cookie) via requireClient, so the JWT-bound RLS client
// already scopes to the owner's business; we additionally pin business_id to
// be explicit. The frustration signal itself lives in calls.intelligence_flags
// (jsonb) and is not mutated here — only the needs_review workflow state.

import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const auth = await requireClient(request)
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const { data, error } = await supabase
    .from('calls')
    .update({ needs_review: false, reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', clientId)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
