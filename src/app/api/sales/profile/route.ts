import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'

export async function PATCH(req: Request) {
  const auth = await requireSalesRep()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as {
    phone?: unknown
    notification_email?: unknown
  }

  const update: Record<string, string | null> = {}

  if ('phone' in body) {
    update.phone = body.phone == null ? null : String(body.phone).trim() || null
  }

  if ('notification_email' in body) {
    const trimmed = body.notification_email == null
      ? null
      : String(body.notification_email).trim() || null
    if (trimmed && !trimmed.includes('@')) {
      return NextResponse.json(
        { ok: false, error: 'Reply-to email looks wrong. Use a real address.' },
        { status: 400 },
      )
    }
    update.notification_email = trimmed
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('sales_reps')
    .update(update)
    .eq('id', auth.rep.id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
