// Google OAuth helper — client Gmail (send) + Google Calendar connection.
//
// Env-gated: until GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET are set
// (i.e. once the Google Cloud OAuth app exists), isGoogleOAuthConfigured()
// returns false and every entry point degrades to a "coming soon" state. No
// route throws, nothing is charged, nothing breaks.
//
// Scopes requested:
//   - openid / email      → identify the connected account
//   - gmail.send          → send AI email replies from the client's own inbox
//                           (RESTRICTED scope — needs Google security review)
//   - calendar.events     → push bookings to the client's Google Calendar
//                           (SENSITIVE scope — needs Google verification)

export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
  // Google Business Profile (Session 78) — read the client's business listing
  // (name/address/phone/hours). SENSITIVE scope: needs Google verification AND
  // GBP API project allowlisting before it functions in prod.
  'https://www.googleapis.com/auth/business.manage',
]

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
}

export function googleRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au'
  return `${base.replace(/\/$/, '')}/api/integrations/google/callback`
}

/** Build the Google consent-screen URL. `state` is an opaque CSRF nonce. */
export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',       // we want a refresh token
    prompt: 'consent',            // force refresh-token issuance on re-connect
    include_granted_scopes: 'true',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export interface GoogleTokenResponse {
  access_token?: string
  refresh_token?: string
  scope?: string
  expires_in?: number
  token_type?: string
  id_token?: string
  error?: string
  error_description?: string
}

/** Exchange an authorization code for tokens. */
export async function exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  return (await res.json().catch(() => ({}))) as GoogleTokenResponse
}

/** Fetch the connected account's email address from an access token. */
export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const j = (await res.json()) as { email?: string }
    return typeof j.email === 'string' ? j.email : null
  } catch {
    return null
  }
}
