// Google Business Profile (GBP). Reuses the Google OAuth connection from
// migration 080 (businesses.google_refresh_token, encrypted with the EXISTING
// crypto.ts encryptSecret/decryptSecret + SERVICEM8_ENCRYPTION_KEY — NOT the
// INTEGRATION_ENCRYPTION_KEY used for HubSpot/MYOB). No new OAuth: we mint a
// short-lived access token from the stored refresh token on demand.
//
// NOTE: the GBP APIs (mybusinessaccountmanagement / mybusinessbusinessinformation)
// require the `business.manage` scope AND Google-approved project access
// (allowlist), so this is inert in prod until that approval lands — every helper
// degrades gracefully (returns [] / null) rather than throwing.

import { decryptSecret } from '@/lib/crypto'
import { isGoogleOAuthConfigured } from '@/lib/google-oauth'

const ACCOUNTS_API = 'https://mybusinessaccountmanagement.googleapis.com/v1'
const INFO_API = 'https://mybusinessbusinessinformation.googleapis.com/v1'
const LOCATION_READ_MASK = 'name,title,storefrontAddress,phoneNumbers,regularHours'

/** GBP is "configured" when the underlying Google OAuth app exists. */
export function isGbpConfigured(): boolean {
  return isGoogleOAuthConfigured()
}

export interface GbpBusiness {
  google_refresh_token?: string | null
  google_business_location_id?: string | null
}

/** Mint a short-lived Google access token from the stored refresh token. */
export async function getGoogleAccessToken(business: GbpBusiness): Promise<string | null> {
  const refresh = decryptSecret(business.google_refresh_token ?? null)
  if (!refresh) return null
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
        refresh_token: refresh,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      console.error('[gbp] token refresh failed', res.status)
      return null
    }
    const j = (await res.json()) as { access_token?: string }
    return j.access_token ?? null
  } catch (e) {
    console.error('[gbp] token refresh exception', (e as Error).message)
    return null
  }
}

export interface GbpLocation {
  locationResourceName: string // "accounts/123/locations/456"
  displayName: string
  address: string | null
  phone: string | null
}

interface RawAddress { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string }
interface RawLocation {
  name?: string // "locations/456"
  title?: string
  storefrontAddress?: RawAddress
  phoneNumbers?: { primaryPhone?: string }
}

function formatAddress(a?: RawAddress): string | null {
  if (!a) return null
  const parts = [
    ...(a.addressLines ?? []),
    a.locality, a.administrativeArea, a.postalCode,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

/** List the client's GBP locations across their first account. [] on any failure. */
export async function listGbpLocations(accessToken: string): Promise<GbpLocation[]> {
  try {
    const acctRes = await fetch(`${ACCOUNTS_API}/accounts`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    })
    if (!acctRes.ok) return []
    const acctData = (await acctRes.json()) as { accounts?: Array<{ name?: string }> }
    const account = acctData.accounts?.[0]?.name
    if (!account) return []

    const locRes = await fetch(
      `${INFO_API}/${account}/locations?readMask=${encodeURIComponent(LOCATION_READ_MASK)}&pageSize=100`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) },
    )
    if (!locRes.ok) return []
    const locData = (await locRes.json()) as { locations?: RawLocation[] }
    return (locData.locations ?? []).map((l) => ({
      locationResourceName: `${account}/${l.name ?? ''}`,
      displayName: l.title ?? '(unnamed location)',
      address: formatAddress(l.storefrontAddress),
      phone: l.phoneNumbers?.primaryPhone ?? null,
    }))
  } catch (e) {
    console.error('[gbp] listLocations exception', (e as Error).message)
    return []
  }
}

export interface GbpPulled {
  name: string | null
  address: string | null
  phone: string | null
  hours: unknown | null
}

/** Fetch one location's details for a stored resource name. null on failure. */
export async function getGbpLocation(accessToken: string, locationResourceName: string): Promise<GbpPulled | null> {
  try {
    // The single-location GET lives under the business information API, keyed on
    // the "locations/{id}" segment of the stored resource name.
    const locSegment = locationResourceName.includes('/locations/')
      ? 'locations/' + locationResourceName.split('/locations/')[1]
      : locationResourceName
    const res = await fetch(
      `${INFO_API}/${locSegment}?readMask=${encodeURIComponent(LOCATION_READ_MASK)}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) },
    )
    if (!res.ok) return null
    const l = (await res.json()) as RawLocation & { regularHours?: unknown }
    return {
      name: l.title ?? null,
      address: formatAddress(l.storefrontAddress),
      phone: l.phoneNumbers?.primaryPhone ?? null,
      hours: l.regularHours ?? null,
    }
  } catch (e) {
    console.error('[gbp] getLocation exception', (e as Error).message)
    return null
  }
}
