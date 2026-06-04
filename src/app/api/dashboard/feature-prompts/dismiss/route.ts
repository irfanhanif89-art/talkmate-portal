// Session 4B — dismiss a feature-discovery prompt (sticky per business).
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const url = new URL(req.url)
  const adminClientId = url.searchParams.get('adminClientId')
  const resolved = await resolveBusinessId(adminClientId, req)
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })
  }

  let body: { key?: string } = {}
  try { body = await req.json() } catch { /* empty */ }
  const key = (body.key ?? '').trim()
  if (!key) return NextResponse.json({ ok: false, error: 'missing_key' }, { status: 400 })

  const supabase = createAdminClient()
  await supabase.from('banner_dismissals')
    .upsert({ business_id: resolved.businessId, banner_key: key }, { onConflict: 'business_id,banner_key' })

  return NextResponse.json({ ok: true })
}
