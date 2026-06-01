import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

// Admin moves a submitted rep invoice through its lifecycle:
//   approve  → status 'approved'
//   pay      → status 'paid'      (optional payment_reference)
//   reject   → status 'rejected'  (admin_note = reason)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = await req.json().catch(() => ({})) as {
    action?: string
    payment_reference?: string
    admin_note?: string
  }

  const action = body.action
  if (!['approve', 'pay', 'reject'].includes(action ?? '')) {
    return NextResponse.json({ ok: false, error: 'action must be approve, pay, or reject' }, { status: 400 })
  }

  const nowIso = new Date().toISOString()
  const update: Record<string, unknown> = { reviewed_at: nowIso }

  if (action === 'approve') {
    update.status = 'approved'
  } else if (action === 'pay') {
    update.status = 'paid'
    update.paid_at = nowIso
    if (body.payment_reference?.trim()) update.payment_reference = body.payment_reference.trim().slice(0, 120)
  } else if (action === 'reject') {
    update.status = 'rejected'
    update.admin_note = (body.admin_note ?? '').trim().slice(0, 500) || 'Rejected'
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('rep_invoices')
    .update(update)
    .eq('id', id)
    .select('id, status, payment_reference, admin_note, paid_at, reviewed_at')
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Invoice not found' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, invoice: data })
}
