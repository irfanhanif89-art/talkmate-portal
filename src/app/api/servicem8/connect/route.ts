// POST /api/servicem8/connect  — user auth (or ?adminClientId)
// Validates a ServiceM8 API key, then stores it and enables the integration.
// NOTE (DEPLOYMENT): the key is stored as plain text in businesses.servicem8_api_key.
// A follow-up should encrypt it at rest (e.g. pgcrypto / a KMS-wrapped column).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

const SM8 = 'https://api.servicem8.com/api_1.0'

function basicAuth(apiKey: string): string {
  return 'Basic ' + Buffer.from(`${apiKey}:x`).toString('base64')
}

export async function POST(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  let body: { apiKey?: string }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }) }
  const apiKey = (body.apiKey ?? '').trim()
  if (!apiKey) return NextResponse.json({ ok: false, error: 'API key is required.' }, { status: 400 })

  // Validate by calling a cheap authenticated endpoint.
  let companyName: string | null = null
  let companyUuid: string | null = null
  try {
    const res = await fetch(`${SM8}/staff.json`, { headers: { Authorization: basicAuth(apiKey) } })
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: 'Invalid API key' }, { status: 400 })
    }
    // Best-effort company lookup (non-fatal).
    try {
      const cc = await fetch(`${SM8}/companycontact.json`, { headers: { Authorization: basicAuth(apiKey) } })
      if (cc.ok) {
        const rows = (await cc.json()) as Array<{ company_uuid?: string; first?: string; last?: string }>
        if (Array.isArray(rows) && rows[0]) {
          companyUuid = rows[0].company_uuid ?? null
          companyName = [rows[0].first, rows[0].last].filter(Boolean).join(' ') || null
        }
      }
    } catch { /* non-fatal */ }
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not reach ServiceM8. Try again.' }, { status: 502 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('businesses')
    .update({
      servicem8_api_key: apiKey,
      servicem8_company_uuid: companyUuid,
      servicem8_enabled: true,
    })
    .eq('id', auth.businessId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, message: 'ServiceM8 connected', companyName })
}
