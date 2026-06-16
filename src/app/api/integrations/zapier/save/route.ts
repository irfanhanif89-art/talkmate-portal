// POST /api/integrations/zapier/save — session auth (or ?adminClientId)
// Body: { webhook_url: string | null }. Saves/clears the client's Zapier hook.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const auth = await resolveBusinessId(adminClientId, request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  let body: { webhook_url?: string | null }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }) }

  const raw = (body.webhook_url ?? '').trim()
  if (raw && !/^https:\/\//i.test(raw)) {
    return NextResponse.json({ ok: false, error: 'Webhook URL must start with https://' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('businesses')
    .update({
      zapier_webhook_url: raw || null,
      zapier_connected_at: raw ? new Date().toISOString() : null,
    })
    .eq('id', auth.businessId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
