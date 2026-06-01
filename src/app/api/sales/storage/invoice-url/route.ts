import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { requireAdmin } from '@/lib/admin-auth'

// Returns a short-lived signed URL for an invoice PDF. Accessible to the
// rep who owns the invoice OR to an admin (so the admin queue can view the
// PDF before paying). Pass ?id=<rep_invoices.id>.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: invoice } = await admin
    .from('rep_invoices')
    .select('id, rep_id, document_path')
    .eq('id', id)
    .maybeSingle()

  if (!invoice?.document_path) {
    return NextResponse.json({ ok: false, error: 'Invoice not found' }, { status: 404 })
  }

  // Authorise: either an admin, or the rep who owns this invoice.
  const adminAuth = await requireAdmin()
  if (!adminAuth.ok) {
    const repAuth = await requireSalesRep(req)
    if (!repAuth.ok) return NextResponse.json({ ok: false, error: repAuth.error }, { status: repAuth.status })
    if (repAuth.rep.id !== invoice.rep_id) {
      return NextResponse.json({ ok: false, error: 'Not your invoice' }, { status: 403 })
    }
  }

  const { data: signed, error } = await admin.storage
    .from('rep-invoices')
    .createSignedUrl(invoice.document_path, 3600)

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Could not generate URL' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, url: signed.signedUrl, expires_in: 3600 })
}
