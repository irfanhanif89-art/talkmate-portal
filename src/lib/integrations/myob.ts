// MYOB AccountRight sync. On a qualifying call (duration >= 30s, not abandoned,
// caller phone present) we create a Customer record in the connected company
// file if one doesn't already exist. OAuth tokens stored AES-256-GCM encrypted
// under INTEGRATION_ENCRYPTION_KEY.
//
// MYOB access tokens expire after ~20 minutes; we retry once on a 401 by
// refreshing. NOTE: AccountRight *cloud* company files also require an
// x-myobapi-cftoken (base64 of the company-file username:password) on data
// calls. We don't collect those yet, so live customer creation may 401 until
// that is added — acceptable while the integration ships env-gated (no creds).

import { createAdminClient } from '@/lib/supabase/server'
import { encryptWith, decryptWith } from '@/lib/crypto'
import type { IntegrationBusiness, IntegrationCall } from './types'

const KEY_LABEL = 'INTEGRATION_ENCRYPTION_KEY'
const AUTH_URL = 'https://secure.myob.com/oauth2/account/authorize'
const TOKEN_URL = 'https://secure.myob.com/oauth2/v1/authorize'
const API_BASE = 'https://api.myob.com/accountright'

export function isMyobConfigured(): boolean {
  return Boolean(process.env.MYOB_CLIENT_ID && process.env.MYOB_CLIENT_SECRET)
}

export function myobRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au'
  return `${base.replace(/\/$/, '')}/api/integrations/myob/callback`
}

export function buildMyobAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MYOB_CLIENT_ID || '',
    redirect_uri: myobRedirectUri(),
    response_type: 'code',
    scope: 'CompanyFile',
    state,
  })
  return `${AUTH_URL}?${params.toString()}`
}

export interface MyobTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
}

function myobHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'x-myobapi-key': process.env.MYOB_CLIENT_ID || '',
    'x-myobapi-version': 'v2',
    Accept: 'application/json',
  }
}

export async function exchangeMyobCode(code: string): Promise<MyobTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.MYOB_CLIENT_ID || '',
      client_secret: process.env.MYOB_CLIENT_SECRET || '',
      redirect_uri: myobRedirectUri(),
      code,
    }),
  })
  return (await res.json().catch(() => ({}))) as MyobTokenResponse
}

export interface MyobCompanyFile { Id?: string; Name?: string }

/** List the company files visible to an access token. */
export async function fetchMyobCompanyFiles(token: string): Promise<MyobCompanyFile[]> {
  try {
    const res = await fetch(`${API_BASE}/`, { headers: myobHeaders(token) })
    if (!res.ok) return []
    const rows = await res.json()
    return Array.isArray(rows) ? (rows as MyobCompanyFile[]) : []
  } catch {
    return []
  }
}

function currentAccessToken(business: IntegrationBusiness): string {
  const tok = decryptWith(business.myob_access_token ?? null, process.env.INTEGRATION_ENCRYPTION_KEY, KEY_LABEL)
  if (!tok) throw new Error('myob_not_connected')
  return tok
}

async function refreshMyobToken(business: IntegrationBusiness): Promise<string> {
  const refresh = decryptWith(business.myob_refresh_token ?? null, process.env.INTEGRATION_ENCRYPTION_KEY, KEY_LABEL)
  if (!refresh) throw new Error('myob_no_refresh_token')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.MYOB_CLIENT_ID || '',
      client_secret: process.env.MYOB_CLIENT_SECRET || '',
      refresh_token: refresh,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as MyobTokenResponse
  if (!res.ok || !data.access_token) throw new Error(`myob_refresh_failed: ${data.error ?? res.status}`)
  const admin = createAdminClient()
  const encAccess = encryptWith(data.access_token, process.env.INTEGRATION_ENCRYPTION_KEY, KEY_LABEL)
  await admin
    .from('businesses')
    .update({
      myob_access_token: encAccess,
      ...(data.refresh_token
        ? { myob_refresh_token: encryptWith(data.refresh_token, process.env.INTEGRATION_ENCRYPTION_KEY, KEY_LABEL) }
        : {}),
    })
    .eq('id', business.id)
  business.myob_access_token = encAccess
  return data.access_token
}

async function myobFetch(business: IntegrationBusiness, path: string, init: RequestInit): Promise<Response> {
  let token = currentAccessToken(business)
  const doFetch = (t: string) => fetch(`${API_BASE}/${business.myob_company_id}${path}`, {
    ...init,
    headers: { ...myobHeaders(t), ...(init.headers ?? {}) },
  })
  let res = await doFetch(token)
  if (res.status === 401) {
    token = await refreshMyobToken(business)
    res = await doFetch(token)
  }
  return res
}

/** Create the caller as a MYOB customer if not already present. Never blocks. */
export async function fireMyobSync(business: IntegrationBusiness, call: IntegrationCall): Promise<void> {
  if (!isMyobConfigured()) return
  if (!business.myob_access_token || !business.myob_company_id) return
  const phone = call.caller_number?.replace(/\s/g, '') || ''
  if (!phone) return

  const searchRes = await myobFetch(
    business,
    `/Contact/Customer?$filter=${encodeURIComponent(`Addresses/any(a: a/Phone eq '${phone}')`)}`,
    { method: 'GET' },
  )
  const searchData = (await searchRes.json().catch(() => ({}))) as { Count?: number }
  if ((searchData.Count ?? 0) > 0) return // already exists — nothing to do for v1

  const createRes = await myobFetch(business, '/Contact/Customer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      CompanyName: `TalkMate Lead — ${phone}`,
      IsActive: true,
      Addresses: [{ Location: 1, Phone1: phone }],
      Notes: `Created automatically by TalkMate from a call on ${new Date(call.started_at || Date.now()).toLocaleDateString('en-AU')}. Call duration: ${call.duration_seconds ?? 0}s.`,
    }),
  })
  if (!createRes.ok) console.error('[myob] customer create failed', createRes.status)
}
