import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { notifyAdminAlert, sendTerminationEmail } from '@/lib/sales-notify'
import { findAuthUserByEmail } from '@/lib/find-auth-user'

export const dynamic = 'force-dynamic'

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const { id } = await ctx.params

  const body = (await req.json().catch(() => ({}))) as { reason?: unknown }
  const reason = body.reason ? String(body.reason).trim() : null

  const admin = createAdminClient()

  const { data: contractor } = await admin
    .from('contractors')
    .select('id, first_name, last_name, email, sales_rep_id, portal_access_email, status')
    .eq('id', id)
    .maybeSingle()

  if (!contractor) {
    return NextResponse.json({ ok: false, error: 'Contractor not found' }, { status: 404 })
  }

  const terminationIso = new Date().toISOString()

  const { error } = await admin
    .from('contractors')
    .update({
      status: 'terminated',
      termination_date: terminationIso,
      termination_reason: reason,
    })
    .eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Mark linked sales_rep inactive so they cannot earn new commissions.
  if (contractor.sales_rep_id) {
    await admin
      .from('sales_reps')
      .update({ status: 'inactive' })
      .eq('id', contractor.sales_rep_id)
  }

  // Ban the Supabase auth user (10 years) so they can no longer log in.
  const authEmail = contractor.portal_access_email ?? contractor.email
  if (authEmail) {
    const existing = await findAuthUserByEmail(admin, authEmail)
    if (existing) {
      await admin.auth.admin.updateUserById(existing.id, { ban_duration: '87600h' })
    }
  }

  // Notify the contractor by email and the admin by Telegram.
  const fullName = `${contractor.first_name} ${contractor.last_name}`.trim()
  const terminationDateLabel = new Date(terminationIso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane',
  })

  sendTerminationEmail({
    email: contractor.email,
    name: fullName,
    terminationDate: terminationDateLabel,
  }).catch(() => {})

  notifyAdminAlert(
    `🔴 Contractor terminated: ${fullName} (${contractor.email}). Portal access revoked.${reason ? ` Reason: ${reason}` : ''}`,
  ).catch(() => {})

  return NextResponse.json({ ok: true })
}
