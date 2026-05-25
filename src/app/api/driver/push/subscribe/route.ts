import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireDriver } from '@/lib/driver-auth'

// POST /api/driver/push/subscribe — body: { subscription }
// Stores the PushSubscription JSON for this driver. The service
// worker on /driver/* posts here right after permission is granted.

export async function POST(req: Request) {
  const auth = await requireDriver()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as { subscription?: unknown }
  const sub = body.subscription as { endpoint?: string } | undefined
  if (!sub || typeof sub.endpoint !== 'string') {
    return NextResponse.json({ ok: false, error: 'subscription is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Upsert on (driver_id, endpoint) per the migration-048 unique
  // constraint, so a re-subscribe doesn't create duplicates.
  const { error } = await admin
    .from('driver_push_subscriptions')
    .upsert({
      driver_id: auth.driver.id,
      client_id: auth.driver.client_id,
      endpoint: sub.endpoint,
      subscription_json: sub,
      user_agent: req.headers.get('user-agent') ?? null,
    }, { onConflict: 'driver_id,endpoint' })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
