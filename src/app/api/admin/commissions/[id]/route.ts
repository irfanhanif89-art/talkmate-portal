import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { sendEmail } from '@/lib/resend'
import { commissionRevokedEmailHtml } from '@/lib/sales-notify'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const body = (await req.json().catch(() => ({}))) as {
    action?: unknown
    payment_reference?: unknown
    revoke_reason?: unknown
  }
  const action = String(body.action ?? '')
  const payment_reference = body.payment_reference ? String(body.payment_reference).trim() : null
  const revoke_reason = body.revoke_reason ? String(body.revoke_reason).trim() : null

  if (action !== 'approve' && action !== 'pay' && action !== 'revoke') {
    return NextResponse.json({ ok: false, error: 'action must be approve, pay, or revoke' }, { status: 400 })
  }
  if (action === 'pay' && !payment_reference) {
    return NextResponse.json({ ok: false, error: 'payment_reference is required to mark as paid' }, { status: 400 })
  }
  if (action === 'revoke' && !revoke_reason) {
    return NextResponse.json({ ok: false, error: 'revoke_reason is required to revoke' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: commission } = await admin
    .from('commissions')
    .select(`
      id, status, commission_amount, rep_id, lead_id,
      sales_reps:rep_id (full_name, email),
      leads:lead_id (business_name)
    `)
    .eq('id', id)
    .maybeSingle()

  if (!commission) return NextResponse.json({ ok: false, error: 'Commission not found' }, { status: 404 })

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = {}

  if (action === 'approve') {
    if (commission.status !== 'pending') {
      return NextResponse.json({ ok: false, error: 'Only pending commissions can be approved' }, { status: 409 })
    }
    updates.status = 'approved'
    updates.approved_at = now
  } else if (action === 'pay') {
    if (commission.status !== 'approved') {
      return NextResponse.json({ ok: false, error: 'Only approved commissions can be marked paid' }, { status: 409 })
    }
    updates.status = 'paid'
    updates.paid_at = now
    updates.payment_reference = payment_reference
  } else if (action === 'revoke') {
    if (commission.status === 'revoked') {
      return NextResponse.json({ ok: false, error: 'Already revoked' }, { status: 409 })
    }
    updates.status = 'revoked'
    updates.revoke_reason = revoke_reason
  }

  const { error } = await admin.from('commissions').update(updates).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // On revoke, email the rep so they know.
  if (action === 'revoke') {
    const repField = commission.sales_reps as { full_name?: string; email?: string } | Array<{ full_name?: string; email?: string }> | null
    const rep = Array.isArray(repField) ? repField[0] : repField
    const leadField = commission.leads as { business_name?: string } | Array<{ business_name?: string }> | null
    const lead = Array.isArray(leadField) ? leadField[0] : leadField
    if (rep?.email) {
      sendEmail({
        to: rep.email,
        subject: `Commission revoked — ${lead?.business_name ?? 'deal'}`,
        html: commissionRevokedEmailHtml({
          repName: rep.full_name ?? 'Rep',
          businessName: lead?.business_name ?? 'this deal',
          amount: Number(commission.commission_amount ?? 0),
          reason: revoke_reason ?? '',
        }),
      }).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true })
}
