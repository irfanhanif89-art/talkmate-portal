// GET /api/integrations/hubspot/connect — owner-only. Redirects to HubSpot OAuth.
// Env-gated: 503 { configured:false } until the HubSpot app exists.

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { resolveBusinessId } from '@/lib/resolve-business'
import { isHubSpotConfigured, buildHubSpotAuthUrl } from '@/lib/integrations/hubspot'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  if (!isHubSpotConfigured()) {
    return NextResponse.json({ ok: false, configured: false, error: 'HubSpot connection is being set up.' }, { status: 503 })
  }
  const resolved = await resolveBusinessId()
  if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })

  const state = crypto.randomUUID()
  const res = NextResponse.redirect(buildHubSpotAuthUrl(state))
  res.cookies.set('hs_oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600,
  })
  return res
}
