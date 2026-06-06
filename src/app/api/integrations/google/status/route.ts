// GET /api/integrations/google/status[?adminClientId=]
// Returns whether the Google OAuth app is configured at all, and whether THIS
// business has a Google account connected. Drives the connect-card UI state.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { isGoogleOAuthConfigured } from '@/lib/google-oauth'

export async function GET(request: NextRequest) {
  const adminClientId = request.nextUrl.searchParams.get('adminClientId')
  const resolved = await resolveBusinessId(adminClientId)
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })
  }

  const configured = isGoogleOAuthConfigured()

  // When the app isn't configured yet there are no connection details to read
  // (and the columns may be inert), so short-circuit.
  if (!configured) {
    return NextResponse.json({ ok: true, configured: false, connected: false, email: null })
  }

  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses')
    .select('google_account_email, gmail_enabled, google_calendar_enabled, google_connected_at')
    .eq('id', resolved.businessId)
    .limit(1)
    .maybeSingle()

  const b = (biz ?? {}) as Record<string, unknown>
  const email = (b.google_account_email as string | null) ?? null

  return NextResponse.json({
    ok: true,
    configured: true,
    connected: Boolean(email),
    email,
    gmailEnabled: Boolean(b.gmail_enabled),
    calendarEnabled: Boolean(b.google_calendar_enabled),
    connectedAt: (b.google_connected_at as string | null) ?? null,
    isAdmin: resolved.isAdmin,
  })
}
