import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

// Session 24 — mark an agent_health_alert as resolved.
// Used by the agent-health dashboard "Mark resolved" button.

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: { alert_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const alertId = body.alert_id?.trim()
  if (!alertId) return NextResponse.json({ error: 'alert_id required' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('agent_health_alerts')
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: auth.user.email ?? 'admin',
    })
    .eq('id', alertId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
