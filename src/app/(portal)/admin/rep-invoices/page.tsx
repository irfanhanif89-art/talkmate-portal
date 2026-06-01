import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/server'
import AdminRepInvoicesView, { type AdminInvoiceRow } from './admin-rep-invoices-view'

export const metadata: Metadata = { title: 'Rep Invoices' }
export const dynamic = 'force-dynamic'

// Auth + admin sidebar chrome are enforced by (portal)/admin/layout.tsx.
export default async function AdminRepInvoicesPage() {
  const admin = createAdminClient()

  const { data: invoices } = await admin
    .from('rep_invoices')
    .select('id, rep_id, invoice_number, amount, period_label, notes, document_name, status, admin_note, payment_reference, submitted_at, due_at, paid_at')
    .order('submitted_at', { ascending: false })

  // Resolve rep names in one lookup.
  const repIds = Array.from(new Set((invoices ?? []).map(i => i.rep_id)))
  const repNameById = new Map<string, string>()
  if (repIds.length > 0) {
    const { data: reps } = await admin
      .from('sales_reps')
      .select('id, full_name')
      .in('id', repIds)
    for (const r of reps ?? []) repNameById.set(r.id, r.full_name)
  }

  const rows: AdminInvoiceRow[] = (invoices ?? []).map(i => ({
    id: i.id,
    rep_name: repNameById.get(i.rep_id) ?? 'Unknown rep',
    invoice_number: i.invoice_number,
    amount: i.amount === null ? null : Number(i.amount),
    period_label: i.period_label,
    notes: i.notes,
    document_name: i.document_name,
    status: i.status as AdminInvoiceRow['status'],
    admin_note: i.admin_note,
    payment_reference: i.payment_reference,
    submitted_at: i.submitted_at,
    due_at: i.due_at,
    paid_at: i.paid_at,
  }))

  return <AdminRepInvoicesView initialInvoices={rows} />
}
