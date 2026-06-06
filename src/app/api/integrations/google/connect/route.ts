// GET /api/integrations/google/connect
// Starts the Google OAuth consent flow for the signed-in owner. Returns the
// consent URL (the client redirects to it) and sets a short-lived CSRF cookie.
//
// Env-gated: if the Google OAuth app is not configured yet, returns 503 with
// { configured: false } so the UI can show its "coming soon" state.

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { resolveBusinessId } from '@/lib/resolve-business'
import { buildGoogleAuthUrl, isGoogleOAuthConfigured } from '@/lib/google-oauth'

export async function GET(request: NextRequest) {
  if (!isGoogleOAuthConfigured()) {
    return NextResponse.json(
      { ok: false, configured: false, error: 'Google connection is being set up.' },
      { status: 503 },
    )
  }

  // Owner-only: the OAuth grant is for the client's own Google account, so the
  // admin-on-behalf path cannot start it.
  const resolved = await resolveBusinessId()
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })
  }

  const rawReturn = request.nextUrl.searchParams.get('return') ?? '/inbox'
  const returnPath = rawReturn.startsWith('/') && !rawReturn.startsWith('//') ? rawReturn : '/inbox'

  const state = crypto.randomUUID()
  const res = NextResponse.json({ ok: true, url: buildGoogleAuthUrl(state) })

  const cookieOpts = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600, // 10 minutes
  }
  res.cookies.set('g_oauth_state', state, cookieOpts)
  res.cookies.set('g_oauth_return', returnPath, cookieOpts)
  return res
}
