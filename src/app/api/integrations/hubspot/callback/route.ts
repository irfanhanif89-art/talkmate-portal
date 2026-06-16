// GET /api/integrations/hubspot/callback — HubSpot redirects here after consent.
// Validates the CSRF cookie, exchanges the code, stores encrypted tokens on the
// signed-in owner's business, then returns to Settings > Integrations.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { encryptWith } from '@/lib/crypto'
import { isHubSpotConfigured, exchangeHubSpotCode, fetchHubSpotPortalId } from '@/lib/integrations/hubspot'

function back(base: string, status: string): NextResponse {
  const res = NextResponse.redirect(`${base}/settings?tab=integrations&connected=${status}`)
  res.cookies.delete('hs_oauth_state')
  return res
}

export async function GET(request: NextRequest) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au').replace(/\/$/, '')
  if (!isHubSpotConfigured()) return back(appUrl, 'hubspot_error')

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const cookieState = request.cookies.get('hs_oauth_state')?.value
  if (!code || !state || !cookieState || state !== cookieState) return back(appUrl, 'hubspot_error')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return back(appUrl, 'hubspot_error')

  const admin = createAdminClient()
  const { data: biz } = await admin.from('businesses').select('id').eq('owner_user_id', user.id).limit(1).maybeSingle()
  if (!biz) return back(appUrl, 'hubspot_error')

  const tokens = await exchangeHubSpotCode(code)
  if (!tokens.access_token || !tokens.refresh_token) {
    console.error('[hubspot-callback] token exchange failed', tokens.message)
    return back(appUrl, 'hubspot_error')
  }

  const portalId = await fetchHubSpotPortalId(tokens.access_token)
  const key = process.env.INTEGRATION_ENCRYPTION_KEY
  await admin.from('businesses').update({
    hubspot_access_token: encryptWith(tokens.access_token, key, 'INTEGRATION_ENCRYPTION_KEY'),
    hubspot_refresh_token: encryptWith(tokens.refresh_token, key, 'INTEGRATION_ENCRYPTION_KEY'),
    hubspot_portal_id: portalId,
    hubspot_connected_at: new Date().toISOString(),
  }).eq('id', biz.id as string)

  return back(appUrl, 'hubspot')
}
