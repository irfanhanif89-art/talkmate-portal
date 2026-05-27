// PATCH /api/admin/contractors/[id]/profile — Session 47.
//
// Admin can edit ALL fields on a sales rep / contractor record:
//   - Identity: full_name (first + last), email, phone
//   - Sales-rep specific: notification_email, status (active|inactive)
//   - Tax + banking: abn, bank_bsb, bank_account_number
//
// Email changes touch THREE places: contractors.email, sales_reps.email,
// auth.users.email. The admin API uses service-role to flip auth.users
// immediately; the old AND new addresses get a notification email so
// the rep is aware of the change in case it was made by mistake or by
// an attacker. Every change writes admin_audit_log + Telegram alert.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { isValidAbnFormat, normaliseAbn } from '@/lib/abn'
import { logAdminAction, diffFields } from '@/lib/audit'
import { notifyAdminAlert } from '@/lib/sales-notify'
import { sendEmail } from '@/lib/resend'

interface UpdateBody {
  full_name?: unknown
  email?: unknown
  phone?: unknown
  notification_email?: unknown
  abn?: unknown
  bank_bsb?: unknown
  bank_account_number?: unknown
  status?: unknown
}

function splitName(full: string): { first: string; last: string } {
  const trimmed = full.trim().replace(/\s+/g, ' ')
  if (!trimmed) return { first: '', last: '' }
  const parts = trimmed.split(' ')
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status })

  const { id: contractorId } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as UpdateBody
  const admin = createAdminClient()

  // ────── Load current contractor + linked rep ──────
  const { data: contractor } = await admin
    .from('contractors')
    .select('id, first_name, last_name, email, phone, abn, bank_bsb, bank_account_number, sales_rep_id, status')
    .eq('id', contractorId)
    .maybeSingle()

  if (!contractor) {
    return NextResponse.json({ ok: false, error: 'Contractor not found' }, { status: 404 })
  }

  const { data: rep } = contractor.sales_rep_id
    ? await admin
        .from('sales_reps')
        .select('id, user_id, full_name, email, phone, notification_email, status')
        .eq('id', contractor.sales_rep_id)
        .maybeSingle()
    : { data: null as null }

  // ────── Validate + collect updates ──────
  const contractorUpdate: Record<string, string | null> = {}
  const repUpdate: Record<string, string | null> = {}
  let newEmail: string | null = null
  let oldEmail: string | null = null

  if ('full_name' in body) {
    const name = body.full_name == null ? '' : String(body.full_name).trim()
    if (!name) {
      return NextResponse.json({ ok: false, error: 'Full name cannot be blank.' }, { status: 400 })
    }
    if (name.length > 200) {
      return NextResponse.json({ ok: false, error: 'Full name is too long.' }, { status: 400 })
    }
    const { first, last } = splitName(name)
    contractorUpdate.first_name = first
    contractorUpdate.last_name = last
    repUpdate.full_name = name
  }

  if ('email' in body) {
    const next = body.email == null ? '' : String(body.email).trim().toLowerCase()
    if (!next || !next.includes('@')) {
      return NextResponse.json({ ok: false, error: 'Email must be a valid address.' }, { status: 400 })
    }
    if (next !== contractor.email.toLowerCase()) {
      oldEmail = contractor.email
      newEmail = next
      contractorUpdate.email = next
      repUpdate.email = next
    }
  }

  if ('phone' in body) {
    const trimmed = body.phone == null ? null : String(body.phone).trim() || null
    contractorUpdate.phone = trimmed
    repUpdate.phone = trimmed
  }

  if ('notification_email' in body) {
    const trimmed = body.notification_email == null
      ? null
      : String(body.notification_email).trim() || null
    if (trimmed && !trimmed.includes('@')) {
      return NextResponse.json({ ok: false, error: 'Notification email looks wrong.' }, { status: 400 })
    }
    repUpdate.notification_email = trimmed
  }

  if ('abn' in body) {
    const raw = body.abn == null ? '' : String(body.abn).trim()
    if (raw) {
      const normalised = normaliseAbn(raw)
      if (!isValidAbnFormat(normalised)) {
        return NextResponse.json(
          { ok: false, error: 'ABN must be a valid 11-digit Australian Business Number.' },
          { status: 400 },
        )
      }
      contractorUpdate.abn = normalised
    } else {
      // Admin can clear (unlike rep self-edit which refuses) — but flag it.
      contractorUpdate.abn = null
    }
  }

  if ('bank_bsb' in body) {
    contractorUpdate.bank_bsb = body.bank_bsb == null ? null : String(body.bank_bsb).trim() || null
  }

  if ('bank_account_number' in body) {
    contractorUpdate.bank_account_number = body.bank_account_number == null
      ? null
      : String(body.bank_account_number).trim() || null
  }

  if ('status' in body) {
    const next = body.status == null ? '' : String(body.status).trim()
    if (next !== 'active' && next !== 'inactive') {
      return NextResponse.json(
        { ok: false, error: 'Status must be either active or inactive.' },
        { status: 400 },
      )
    }
    repUpdate.status = next
  }

  if (Object.keys(contractorUpdate).length === 0 && Object.keys(repUpdate).length === 0) {
    return NextResponse.json({ ok: true, changed: [] })
  }

  // ────── Apply contractor + rep table updates ──────
  if (Object.keys(contractorUpdate).length > 0) {
    const { error } = await admin
      .from('contractors')
      .update(contractorUpdate)
      .eq('id', contractorId)
    if (error) {
      return NextResponse.json({ ok: false, error: `Contractor update failed: ${error.message}` }, { status: 500 })
    }
  }

  if (Object.keys(repUpdate).length > 0 && rep) {
    const { error } = await admin
      .from('sales_reps')
      .update(repUpdate)
      .eq('id', rep.id)
    if (error) {
      return NextResponse.json({ ok: false, error: `Rep update failed: ${error.message}` }, { status: 500 })
    }
  }

  // ────── auth.users email update + dual notification ──────
  if (newEmail && oldEmail && rep?.user_id) {
    const { error: authErr } = await admin.auth.admin.updateUserById(rep.user_id, {
      email: newEmail,
      // email_confirm:true skips the confirmation requirement so the rep
      // can sign in immediately with the new address. This is acceptable
      // because (a) the admin is taking explicit action, (b) BOTH the old
      // and new address receive a notification email (below) so any
      // accidental / malicious change is visible to the rep within seconds.
      email_confirm: true,
    })
    if (authErr) {
      // Roll back the contractor + rep email writes since auth.users
      // didn't flip. Leaving them out of sync would let the rep think
      // their email changed when they actually can't log in with it.
      const rollback: Record<string, string> = { email: oldEmail }
      await admin.from('contractors').update(rollback).eq('id', contractorId)
      if (rep) await admin.from('sales_reps').update(rollback).eq('id', rep.id)
      return NextResponse.json(
        { ok: false, error: `Auth email update failed (rolled back): ${authErr.message}` },
        { status: 500 },
      )
    }

    // Notify BOTH addresses so the rep notices regardless of which inbox
    // they monitor. Failures here don't roll back — the auth change is
    // already committed; admin gets a Telegram alert as the fallback
    // notification channel.
    const fullName = repUpdate.full_name ?? rep.full_name
    const html = emailChangedByAdminHtml({ name: fullName ?? 'there', oldEmail, newEmail })
    Promise.all([
      sendEmail({ to: oldEmail, subject: 'Your TalkMate login email was changed', html }),
      sendEmail({ to: newEmail, subject: 'You can now sign in to TalkMate with this address', html }),
    ]).catch(() => {})
  }

  // ────── Audit log entry ──────
  const beforeMerged: Record<string, unknown> = {
    full_name: rep?.full_name ?? `${contractor.first_name} ${contractor.last_name}`.trim(),
    email: contractor.email,
    phone: contractor.phone,
    notification_email: rep?.notification_email ?? null,
    abn: contractor.abn,
    bank_bsb: contractor.bank_bsb,
    bank_account_number: contractor.bank_account_number,
    status: rep?.status ?? contractor.status,
  }
  const afterMerged: Record<string, unknown> = {
    ...beforeMerged,
    ...(repUpdate.full_name !== undefined ? { full_name: repUpdate.full_name } : {}),
    ...(contractorUpdate.email !== undefined ? { email: contractorUpdate.email } : {}),
    ...(contractorUpdate.phone !== undefined ? { phone: contractorUpdate.phone } : {}),
    ...(repUpdate.notification_email !== undefined ? { notification_email: repUpdate.notification_email } : {}),
    ...(contractorUpdate.abn !== undefined ? { abn: contractorUpdate.abn } : {}),
    ...(contractorUpdate.bank_bsb !== undefined ? { bank_bsb: contractorUpdate.bank_bsb } : {}),
    ...(contractorUpdate.bank_account_number !== undefined ? { bank_account_number: contractorUpdate.bank_account_number } : {}),
    ...(repUpdate.status !== undefined ? { status: repUpdate.status } : {}),
  }
  const diff = diffFields(beforeMerged, afterMerged)
  const afterAnnotated: Record<string, unknown> = {
    ...diff.after,
    _rep_id: rep?.id ?? null,
    _contractor_id: contractor.id,
  }

  const action = newEmail ? 'rep_email_changed_by_admin' : 'rep_profile_admin_update'
  await logAdminAction({
    adminEmail: gate.user.email ?? 'unknown',
    action,
    businessId: null,
    businessName: `Rep: ${afterMerged.full_name ?? contractor.first_name}`,
    before: diff.before,
    after: afterAnnotated,
    request: req,
  })

  // ────── Telegram alert ──────
  const changedFields = Object.keys(diff.after)
  if (changedFields.length > 0) {
    const lines = [
      '🔧 Admin updated rep profile',
      `Admin: ${gate.user.email ?? 'unknown'}`,
      `Rep: ${afterMerged.full_name ?? ''} (${afterMerged.email ?? contractor.email})`,
      `Changed: ${changedFields.join(', ')}`,
    ]
    if (newEmail) {
      lines.push(`📧 Login email: ${oldEmail} → ${newEmail}`)
    }
    notifyAdminAlert(lines.join('\n')).catch(() => {})
  }

  return NextResponse.json({ ok: true, changed: changedFields })
}

function emailChangedByAdminHtml(opts: { name: string; oldEmail: string; newEmail: string }) {
  return `
<!doctype html>
<html><body style="font-family: 'Outfit', Arial, sans-serif; background: #f4f5f7; padding: 0; margin: 0;">
  <div style="max-width: 560px; margin: 30px auto; background: white; border-radius: 12px; overflow: hidden;">
    <div style="background: #061322; padding: 18px 24px;">
      <div style="font-family: 'Outfit', Arial, sans-serif; font-size: 18px; font-weight: 800; color: white;">
        TalkMate <span style="color: #E8622A;">Sales HQ</span>
      </div>
    </div>
    <div style="padding: 26px 24px; color: #061322; font-size: 14px; line-height: 1.65;">
      <h2 style="margin: 0 0 12px; font-size: 19px; font-weight: 800;">Your TalkMate login email was changed</h2>
      <p>Hi ${escapeHtml(opts.name)},</p>
      <p>A TalkMate admin updated the email on your sales rep account.</p>
      <ul style="padding-left: 18px; margin: 0 0 14px;">
        <li><strong>Previous:</strong> ${escapeHtml(opts.oldEmail)}</li>
        <li><strong>New:</strong> ${escapeHtml(opts.newEmail)}</li>
      </ul>
      <p>You can now sign in at <a href="https://app.talkmate.com.au/login" style="color: #E8622A;">app.talkmate.com.au/login</a> using the new address.</p>
      <p style="background: rgba(245, 158, 11, 0.08); border-left: 3px solid #f59e0b; padding: 10px 14px; border-radius: 6px;">
        <strong>If you didn&apos;t expect this change</strong>, reply to this email or contact <a href="mailto:hello@talkmate.com.au" style="color: #E8622A;">hello@talkmate.com.au</a> immediately.
      </p>
    </div>
    <div style="padding: 16px 24px; background: #f9fafb; border-top: 1px solid #eef0f3; font-size: 11px; color: #7BAED4;">
      TalkMate Pty Ltd · hello@talkmate.com.au
    </div>
  </div>
</body></html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
