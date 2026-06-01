import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import InvoicesClient, { type RepInvoiceRow } from '@/components/sales/InvoicesClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Invoices — TalkMate Sales HQ' }

export default async function SalesInvoicesPage() {
  const auth = await requireSalesRep()
  if (!auth.ok) redirect('/')

  const admin = createAdminClient()
  const { data } = await admin
    .from('rep_invoices')
    .select('id, invoice_number, amount, period_label, notes, document_name, status, admin_note, payment_reference, submitted_at, due_at, paid_at')
    .eq('rep_id', auth.rep.id)
    .order('submitted_at', { ascending: false })

  return (
    <div style={{ padding: '24px 24px 60px', fontFamily: 'Outfit, sans-serif', maxWidth: 860 }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Invoices</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, marginTop: 4 }}>
          Invoice TalkMate for your closed commissions. Upload your invoice PDF here and we&apos;ll
          process and pay it within 14 days.
        </p>
      </div>

      <InvoicesClient initialInvoices={(data ?? []) as RepInvoiceRow[]} />
    </div>
  )
}
