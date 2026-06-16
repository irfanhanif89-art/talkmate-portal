// HubSpot CRM sync. On a qualifying call (duration >= 30s, not abandoned) we
// find-or-create a contact by phone and log a call note. OAuth tokens are
// stored AES-256-GCM encrypted under INTEGRATION_ENCRYPTION_KEY.
//
// HubSpot access tokens expire after 30 minutes; we don't track expiry, we just
// retry once on a 401 by refreshing. Refreshed tokens are persisted.

import { createAdminClient } from '@/lib/supabase/server'
import { encryptWith, decryptWith } from '@/lib/crypto'
import type { IntegrationBusiness, IntegrationCall } from './types'

const KEY_LABEL = 'INTEGRATION_ENCRYPTION_KEY'
const TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token'
const API = 'https://api.hubapi.com'

export function isHubSpotConfigured(): boolean {
  return Boolean(process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET)
}

export function hubspotRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au'
  return `${base.replace(/\/$/, '')}/api/integrations/hubspot/callback`
}

export function buildHubSpotAuthUrl(state: string): string {
  const scopes = 'crm.objects.contacts.read crm.objects.contacts.write crm.objects.notes.write'
  const params = new URLSearchParams({
    client_id: process.env.HUBSPOT_CLIENT_ID || '',
    redirect_uri: hubspotRedirectUri(),
    scope: scopes,
    state,
  })
  return `https://app.hubspot.com/oauth/authorize?${params.toString()}`
}

export interface HubSpotTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  message?: string
}

/** Exchange an authorization code for tokens. */
export async function exchangeHubSpotCode(code: string): Promise<HubSpotTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.HUBSPOT_CLIENT_ID || '',
      client_secret: process.env.HUBSPOT_CLIENT_SECRET || '',
      redirect_uri: hubspotRedirectUri(),
      code,
    }),
  })
  return (await res.json().catch(() => ({}))) as HubSpotTokenResponse
}

/** Look up the portal (hub) id for a freshly minted access token. */
export async function fetchHubSpotPortalId(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${API}/oauth/v1/access-tokens/${accessToken}`)
    if (!res.ok) return null
    const j = (await res.json()) as { hub_id?: number | string }
    return j.hub_id != null ? String(j.hub_id) : null
  } catch {
    return null
  }
}

/** Decrypt and return the stored access token, or throw if unconnected. */
function currentAccessToken(business: IntegrationBusiness): string {
  const tok = decryptWith(business.hubspot_access_token ?? null, process.env.INTEGRATION_ENCRYPTION_KEY, KEY_LABEL)
  if (!tok) throw new Error('hubspot_not_connected')
  return tok
}

/** Refresh the access token, persist the new pair, return the new access token. */
async function refreshHubSpotToken(business: IntegrationBusiness): Promise<string> {
  const refresh = decryptWith(business.hubspot_refresh_token ?? null, process.env.INTEGRATION_ENCRYPTION_KEY, KEY_LABEL)
  if (!refresh) throw new Error('hubspot_no_refresh_token')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.HUBSPOT_CLIENT_ID || '',
      client_secret: process.env.HUBSPOT_CLIENT_SECRET || '',
      refresh_token: refresh,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as HubSpotTokenResponse
  if (!res.ok || !data.access_token) {
    throw new Error(`hubspot_refresh_failed: ${data.message ?? res.status}`)
  }
  const admin = createAdminClient()
  await admin
    .from('businesses')
    .update({
      hubspot_access_token: encryptWith(data.access_token, process.env.INTEGRATION_ENCRYPTION_KEY, KEY_LABEL),
      ...(data.refresh_token
        ? { hubspot_refresh_token: encryptWith(data.refresh_token, process.env.INTEGRATION_ENCRYPTION_KEY, KEY_LABEL) }
        : {}),
    })
    .eq('id', business.id)
  // Mutate the in-memory row so a retry within this request uses the new token.
  business.hubspot_access_token = encryptWith(data.access_token, process.env.INTEGRATION_ENCRYPTION_KEY, KEY_LABEL)
  return data.access_token
}

/** Authenticated HubSpot fetch that refreshes + retries once on a 401. */
async function hsFetch(business: IntegrationBusiness, path: string, init: RequestInit): Promise<Response> {
  let token = currentAccessToken(business)
  const doFetch = (t: string) => fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` },
  })
  let res = await doFetch(token)
  if (res.status === 401) {
    token = await refreshHubSpotToken(business)
    res = await doFetch(token)
  }
  return res
}

/** Find-or-create a contact by phone, then log a call note. Never blocks. */
export async function fireHubSpotSync(business: IntegrationBusiness, call: IntegrationCall): Promise<void> {
  if (!isHubSpotConfigured()) return
  if (!business.hubspot_access_token) return
  const phone = call.caller_number ?? null
  if (!phone) return

  // 1. Search for an existing contact by phone.
  const searchRes = await hsFetch(business, '/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'phone', operator: 'EQ', value: phone }] }],
      properties: ['phone', 'firstname', 'lastname'],
    }),
  })
  const searchData = (await searchRes.json().catch(() => ({}))) as {
    total?: number
    results?: Array<{ id: string }>
  }

  let contactId: string
  if ((searchData.total ?? 0) > 0 && searchData.results?.[0]?.id) {
    contactId = searchData.results[0].id
  } else {
    const createRes = await hsFetch(business, '/crm/v3/objects/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { phone, hs_lead_status: 'NEW' } }),
    })
    const created = (await createRes.json().catch(() => ({}))) as { id?: string }
    if (!created.id) {
      console.error('[hubspot] contact create failed', createRes.status)
      return
    }
    contactId = created.id
  }

  // 2. Log a call note associated to the contact.
  const dur = call.duration_seconds ?? 0
  const noteBody = [
    `TalkMate Call — ${business.name ?? 'Business'}`,
    `Duration: ${Math.floor(dur / 60)}m ${dur % 60}s`,
    `Outcome: ${call.outcome ?? 'Unknown'}`,
    call.intelligence_score != null ? `Call Score: ${call.intelligence_score}/10` : null,
    call.was_abandoned ? 'Note: Caller abandoned (missed call)' : null,
    call.transcript ? `\nTranscript excerpt:\n${call.transcript.slice(0, 800)}` : null,
  ].filter(Boolean).join('\n')

  const noteRes = await hsFetch(business, '/crm/v3/objects/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: {
        hs_note_body: noteBody,
        hs_timestamp: new Date(call.started_at || Date.now()).getTime(),
      },
      associations: [{
        to: { id: contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
      }],
    }),
  })
  if (!noteRes.ok) console.error('[hubspot] note create failed', noteRes.status)
}
