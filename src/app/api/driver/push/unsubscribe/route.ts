import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireDriver } from '@/lib/driver-auth'

// POST /api/driver/push/unsubscribe — body: { endpoint }
// Driver explicitly disabled push or uninstalled the PWA.

export async function POST(req: Request) {
  const auth = await requireDriver()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as { endpoint?: string }
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
  if (!endpoint) return NextResponse.json({ ok: false, error: 'endpoint is required' }, { status: 400 })

  const admin = createAdminClient()
  await admin
    .from('driver_push_subscriptions')
    .delete()
    .eq('driver_id', auth.driver.id)
    .eq('endpoint', endpoint)

  return NextResponse.json({ ok: true })
}
