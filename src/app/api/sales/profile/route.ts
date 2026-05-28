// PATCH /api/sales/profile — Session 47.
//
// Reps can self-edit their own profile fields:
//   - full_name           (sales_reps.full_name + contractors.first/last)
//   - phone               (sales_reps.phone + contractors.phone)
//   - notification_email  (sales_reps.notification_email — proposal reply-to)
//   - abn                 (contractors.abn — validated against ATO checksum)
//   - bank_bsb            (contractors.bank_bsb)
//   - bank_account_number (contractors.bank_account_number)
//
// Every change writes an admin_audit_log row with the before/after diff
// and fires a Telegram alert so admins notice (especially for banking +
// ABN changes that affect commission payouts). DB writes happen
// immediately — there's no admin approval gate.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { isValidAbnFormat, normaliseAbn } from '@/lib/abn'
import { logAdminAction, diffFields } from '@/lib/audit'
import { notifyAdminAlert } from '@/lib/sales-notify'

interface UpdateBody {
  full_name?: unknown
  phone?: unknown
  notification_email?: unknown
  abn?: unknown
  bank_bsb?: unknown
  bank_account_number?: unknown
}

function splitName(full: string): { first: string; last: string } {
  const trimmed = full.trim().replace(/\s+/g, ' ')
  if (!trimmed) return { first: '', last: '' }
  const parts = trimmed.split(' ')
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] }
}

export async function PATCH(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as UpdateBody
  const admin = createAdminClient()

  // ────── Validate inputs ──────
  const repUpdate: Record<string, string | null> = {}
  const contractorUpdate: Record<string, string | null> = {}

  if ('full_name' in body) {
    const name = body.full_name == null ? '' : String(body.full_name).trim()
    if (!name) {
      return NextResponse.json({ ok: false, error: 'Full name is required.' }, { status: 400 })
    }
    if (name.length > 200) {
      return NextResponse.json({ ok: false, error: 'Full name is too long.' }, { status: 400 })
    }
    repUpdate.full_name = name
    const { first, last } = splitName(name)
    contractorUpdate.first_name = first
    contractorUpdate.last_name = last
  }

  if ('phone' in body) {
    const trimmed = body.phone == null ? null : String(body.phone).trim() || null
    repUpdate.phone = trimmed
    contractorUpdate.phone = trimmed
  }

  if ('notification_email' in body) {
    const trimmed = body.notification_email == null
      ? null
      : String(body.notification_email).trim() || null
    if (trimmed && !trimmed.includes('@')) {
      return NextResponse.json(
        { ok: false, error: 'Reply-to email looks wrong. Use a real address or leave it blank.' },
        { status: 400 },
      )
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
      // Explicit clear — but ABN is mandatory for active contractors,
      // refuse the clear to avoid breaking commission payout flow.
      return NextResponse.json(
        { ok: false, error: 'ABN cannot be removed once set. Contact admin if you need to deregister.' },
        { status: 400 },
      )
    }
  }

  if ('bank_bsb' in body) {
    const trimmed = body.bank_bsb == null ? null : String(body.bank_bsb).trim() || null
    contractorUpdate.bank_bsb = trimmed
  }

  if ('bank_account_number' in body) {
    const trimmed = body.bank_account_number == null
      ? null
      : String(body.bank_account_number).trim() || null
    contractorUpdate.bank_account_number = trimmed
  }

  if (Object.keys(repUpdate).length === 0 && Object.keys(contractorUpdate).length === 0) {
    return NextResponse.json({ ok: true })
  }

  // ────── Snapshot before-state for audit diff ──────
  const { data: repBefore } = await admin
    .from('sales_reps')
    .select('full_name, phone, notification_email')
    .eq('id', auth.rep.id)
    .maybeSingle()

  const { data: contractorBefore } = auth.rep.contractor_id
    ? await admin
        .from('contractors')
        .select('first_name, last_name, phone, abn, bank_bsb, bank_account_number')
        .eq('id', auth.rep.contractor_id)
        .maybeSingle()
    : { data: null as null }

  // ────── Apply updates ──────
  if (Object.keys(repUpdate).length > 0) {
    const { error: repErr } = await admin
      .from('sales_reps')
      .update(repUpdate)
      .eq('id', auth.rep.id)
    if (repErr) {
      return NextResponse.json({ ok: false, error: repErr.message }, { status: 500 })
    }
  }

  if (Object.keys(contractorUpdate).length > 0 && auth.rep.contractor_id) {
    const { error: cErr } = await admin
      .from('contractors')
      .update(contractorUpdate)
      .eq('id', auth.rep.contractor_id)
    if (cErr) {
      return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 })
    }
  }

  // ────── Audit log entry ──────
  const beforeMerged = { ...(repBefore ?? {}), ...(contractorBefore ?? {}) }
  const afterMerged = { ...beforeMerged, ...repUpdate, ...contractorUpdate }
  const diff = diffFields(beforeMerged, afterMerged)

  // Embed rep + contractor IDs in the after_value JSON so the row is
  // queryable even though business_id is NULL.
  const afterAnnotated: Record<string, unknown> = {
    ...diff.after,
    _rep_id: auth.rep.id,
    _contractor_id: auth.rep.contractor_id,
  }

  await logAdminAction({
    adminEmail: auth.rep.email, // Rep acting on themselves; not an admin.
    action: 'rep_profile_self_update',
    businessId: null,
    businessName: `Rep: ${auth.rep.full_name}`,
    before: diff.before,
    after: afterAnnotated,
    request: req,
  })

  // ────── Telegram alert ──────
  const changedFields = Object.keys(diff.after)
  if (changedFields.length > 0) {
    const lines = [
      '🔧 Sales rep updated profile',
      `Rep: ${auth.rep.full_name} (${auth.rep.email})`,
      `Changed: ${changedFields.join(', ')}`,
    ]
    // Banking + ABN changes are commission-payout-critical — flag them.
    const moneyFields = ['abn', 'bank_bsb', 'bank_account_number']
    const moneyChanged = changedFields.filter(f => moneyFields.includes(f))
    if (moneyChanged.length > 0) {
      lines.push(`⚠️ Commission payout fields changed: ${moneyChanged.join(', ')}`)
      // Include the new values for the money fields so admin can
      // double-check immediately. Old values stay in the audit log only.
      for (const f of moneyChanged) {
        const newVal = (diff.after as Record<string, unknown>)[f]
        lines.push(`  ${f}: ${newVal ?? '(cleared)'}`)
      }
    }
    notifyAdminAlert(lines.join('\n')).catch(() => {})
  }

  return NextResponse.json({ ok: true, changed: changedFields })
}
