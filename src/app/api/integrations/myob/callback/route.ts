// GET /api/integrations/myob/callback — MYOB redirects here after consent.
// Validates CSRF, exchanges the code, saves the first company file + encrypted
// tokens on the signed-in owner's business, returns to Settings > Integrations.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { encryptWith } from '@/lib/crypto'
import { isMyobConfigured, exchangeMyobCode, fetchMyobCompanyFiles } from '@/lib/integrations/myob'

function back(base: string, status: string): NextResponse {
  const res = NextResponse.redirect(`${base}/settings?tab=integrations&connected=${status}`)
  res.cookies.delete('myob_oauth_state')
  return res
}

export async function GET(request: NextRequest) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au').replace(/\/$/, '')
  if (!isMyobConfigured()) return back(appUrl, 'myob_error')

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const cookieState = request.cookies.get('myob_oauth_state')?.value
  if (!code || !state || !cookieState || state !== cookieState) return back(appUrl, 'myob_error')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return back(appUrl, 'myob_error')

  const admin = createAdminClient()
  const { data: biz } = await admin.from('businesses').select('id').eq('owner_user_id', user.id).limit(1).maybeSingle()
  if (!biz) return back(appUrl, 'myob_error')

  const tokens = await exchangeMyobCode(code)
  if (!tokens.access_token || !tokens.refresh_token) {
    console.error('[myob-callback] token exchange failed', tokens.error)
    return back(appUrl, 'myob_error')
  }

  // Most small businesses have exactly one company file — save the first.
  const files = await fetchMyobCompanyFiles(tokens.access_token)
  const first = files[0]

  const key = process.env.INTEGRATION_ENCRYPTION_KEY
  await admin.from('businesses').update({
    myob_access_token: encryptWith(tokens.access_token, key, 'INTEGRATION_ENCRYPTION_KEY'),
    myob_refresh_token: encryptWith(tokens.refresh_token, key, 'INTEGRATION_ENCRYPTION_KEY'),
    myob_company_id: first?.Id ?? null,
    myob_company_name: first?.Name ?? null,
    myob_connected_at: new Date().toISOString(),
  }).eq('id', biz.id as string)

  return back(appUrl, 'myob')
}
