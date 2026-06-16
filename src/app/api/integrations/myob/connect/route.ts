// GET /api/integrations/myob/connect — owner-only. Redirects to MYOB OAuth.
// Env-gated: 503 { configured:false } until the MYOB app exists.

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { resolveBusinessId } from '@/lib/resolve-business'
import { isMyobConfigured, buildMyobAuthUrl } from '@/lib/integrations/myob'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  if (!isMyobConfigured()) {
    return NextResponse.json({ ok: false, configured: false, error: 'MYOB connection is being set up.' }, { status: 503 })
  }
  const resolved = await resolveBusinessId()
  if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })

  const state = crypto.randomUUID()
  const res = NextResponse.redirect(buildMyobAuthUrl(state))
  res.cookies.set('myob_oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600,
  })
  return res
}
