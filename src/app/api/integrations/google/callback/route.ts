// GET /api/integrations/google/callback
// Google redirects here with ?code & ?state after consent. We verify the CSRF
// state cookie, exchange the code for tokens, store the encrypted refresh token
// on the signed-in owner's business, then redirect back to where they started.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { encryptSecret } from '@/lib/crypto'
import {
  exchangeGoogleCode, fetchGoogleEmail, isGoogleOAuthConfigured, GOOGLE_SCOPES,
} from '@/lib/google-oauth'

function back(base: string, ret: string, status: string): NextResponse {
  const safeRet = ret.startsWith('/') && !ret.startsWith('//') ? ret : '/inbox'
  const sep = safeRet.includes('?') ? '&' : '?'
  const res = NextResponse.redirect(`${base}${safeRet}${sep}google=${status}`)
  res.cookies.delete('g_oauth_state')
  res.cookies.delete('g_oauth_return')
  return res
}

export async function GET(request: NextRequest) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au').replace(/\/$/, '')
  const ret = request.cookies.get('g_oauth_return')?.value ?? '/inbox'

  if (!isGoogleOAuthConfigured()) return back(appUrl, ret, 'error')

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const cookieState = request.cookies.get('g_oauth_state')?.value

  if (!code || !state || !cookieState || state !== cookieState) {
    return back(appUrl, ret, 'error')
  }

  // Identify the owner from their session (they were signed in to start this).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return back(appUrl, ret, 'error')

  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!biz) return back(appUrl, ret, 'error')

  const tokens = await exchangeGoogleCode(code)
  if (tokens.error || !tokens.refresh_token || !tokens.access_token) {
    console.error('[google-callback] token exchange failed', tokens.error, tokens.error_description)
    return back(appUrl, ret, 'error')
  }

  const email = await fetchGoogleEmail(tokens.access_token)
  const granted = tokens.scope ?? GOOGLE_SCOPES.join(' ')
  const hasGmail = granted.includes('gmail.send')
  const hasCalendar = granted.includes('calendar')

  await admin
    .from('businesses')
    .update({
      google_account_email: email,
      google_refresh_token: encryptSecret(tokens.refresh_token),
      google_scopes: granted,
      google_connected_at: new Date().toISOString(),
      gmail_enabled: hasGmail,
      google_calendar_enabled: hasCalendar,
    })
    .eq('id', biz.id as string)

  return back(appUrl, ret, 'connected')
}
