// POST /api/mobile/push-token
//
// The mobile app registers its Expo push token here after login. Bearer (or
// cookie) via requireClient; the token is written to the owner's business with
// the service-role client (the businesses write path is service-role, not RLS).
// Body: { token: string, platform?: 'ios' | 'android' }

import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await requireClient(request)
  if ('error' in auth) return auth.error
  const { clientId } = auth

  let body: { token?: string; platform?: string } = {}
  try { body = await request.json() } catch { /* empty */ }

  const token = (body.token ?? '').trim()
  // Expo tokens look like ExponentPushToken[...] (or ExpoPushToken[...]).
  if (!token || !/^Exp(o|onent)PushToken\[/.test(token)) {
    return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('businesses')
    .update({ expo_push_token: token, expo_push_token_updated_at: new Date().toISOString() })
    .eq('id', clientId)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
