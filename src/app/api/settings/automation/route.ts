// Session 5 — automation toggles for the mobile Settings screen.
// GET/PATCH, cookie/admin/Bearer auth (same dual-mode as billing-contact).
//
// Surfaces the win-back + Google-review automation settings that the web
// Settings -> Automation tab already writes, so the mobile app can toggle them
// without duplicating the full web settings page. These columns ship from
// migration 062 (winback_enabled, winback_custom_message, review_requests_enabled,
// google_review_url).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const resolved = await resolveBusinessId(url.searchParams.get('adminClientId'), req)
  if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('businesses')
    .select('winback_enabled, winback_custom_message, review_requests_enabled, google_review_url')
    .eq('id', resolved.businessId)
    .maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    winbackEnabled: data?.winback_enabled ?? true,
    winbackCustomMessage: data?.winback_custom_message ?? '',
    reviewRequestsEnabled: data?.review_requests_enabled ?? false,
    googleReviewUrl: data?.google_review_url ?? '',
  })
}

export async function PATCH(req: Request) {
  const url = new URL(req.url)
  const resolved = await resolveBusinessId(url.searchParams.get('adminClientId'), req)
  if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })

  let body: {
    winbackEnabled?: boolean
    winbackCustomMessage?: string
    reviewRequestsEnabled?: boolean
    googleReviewUrl?: string
  } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  const patch: Record<string, boolean | string | null> = {}
  if (typeof body.winbackEnabled === 'boolean') patch.winback_enabled = body.winbackEnabled
  if (typeof body.reviewRequestsEnabled === 'boolean') patch.review_requests_enabled = body.reviewRequestsEnabled
  if (typeof body.winbackCustomMessage === 'string') patch.winback_custom_message = body.winbackCustomMessage.trim() || null

  if (typeof body.googleReviewUrl === 'string') {
    const trimmed = body.googleReviewUrl.trim()
    if (trimmed && !/^https?:\/\/.+/i.test(trimmed)) {
      return NextResponse.json({ ok: false, error: 'invalid_review_url' }, { status: 400 })
    }
    patch.google_review_url = trimmed || null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'nothing_to_update' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from('businesses').update(patch).eq('id', resolved.businessId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
