// POST /api/servicem8/test — user auth (or ?adminClientId)
// Re-checks the stored API key against ServiceM8.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { decryptSecret, encryptSecret, isEncrypted } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

const SM8 = 'https://api.servicem8.com/api_1.0'

function basicAuth(apiKey: string): string {
  return 'Basic ' + Buffer.from(`${apiKey}:x`).toString('base64')
}

export async function POST(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: business } = await admin
    .from('businesses')
    .select('servicem8_api_key')
    .eq('id', auth.businessId)
    .maybeSingle()
  const stored = (business?.servicem8_api_key as string | null) ?? null
  if (!stored) return NextResponse.json({ ok: true, connected: false })
  const apiKey = decryptSecret(stored)
  if (!apiKey) return NextResponse.json({ ok: true, connected: false })

  // Opportunistic backfill: upgrade a legacy plain-text key to encrypted.
  if (!isEncrypted(stored)) {
    const enc = encryptSecret(apiKey)
    if (isEncrypted(enc)) {
      await admin.from('businesses').update({ servicem8_api_key: enc }).eq('id', auth.businessId)
    }
  }

  try {
    const res = await fetch(`${SM8}/staff.json`, { headers: { Authorization: basicAuth(apiKey) } })
    let companyName: string | null = null
    if (res.ok) {
      try {
        const cc = await fetch(`${SM8}/companycontact.json`, { headers: { Authorization: basicAuth(apiKey) } })
        if (cc.ok) {
          const rows = (await cc.json()) as Array<{ first?: string; last?: string }>
          if (Array.isArray(rows) && rows[0]) {
            companyName = [rows[0].first, rows[0].last].filter(Boolean).join(' ') || null
          }
        }
      } catch { /* non-fatal */ }
    }
    return NextResponse.json({ ok: true, connected: res.ok, companyName })
  } catch {
    return NextResponse.json({ ok: true, connected: false })
  }
}
