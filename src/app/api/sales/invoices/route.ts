import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { sendAdminTelegram } from '@/lib/notifications'

export const runtime = 'nodejs'

const MAX_SIZE = 20 * 1024 * 1024 // 20MB

// GET — list the calling rep's submitted invoices (newest first).
export async function GET(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('rep_invoices')
    .select('id, invoice_number, amount, period_label, notes, document_name, status, admin_note, payment_reference, submitted_at, due_at, paid_at')
    .eq('rep_id', auth.rep.id)
    .order('submitted_at', { ascending: false })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, invoices: data ?? [] })
}

// POST — rep uploads an invoice PDF they generated themselves.
export async function POST(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ ok: false, error: 'Multipart form expected' }, { status: 400 })

  const file = form.get('file')
  const invoiceNumber = String(form.get('invoice_number') ?? '').trim() || null
  const periodLabel = String(form.get('period_label') ?? '').trim() || null
  const notes = String(form.get('notes') ?? '').trim().slice(0, 500) || null
  const amountRaw = String(form.get('amount') ?? '').trim()
  const amount = amountRaw ? Number(amountRaw.replace(/[^0-9.]/g, '')) : null

  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'Please attach your invoice PDF.' }, { status: 400 })
  if (file.type !== 'application/pdf') return NextResponse.json({ ok: false, error: 'Only PDF files are accepted.' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ ok: false, error: 'Max file size is 20MB.' }, { status: 400 })
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    return NextResponse.json({ ok: false, error: 'Amount must be a positive number.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Upload to rep-invoices/{rep_id}/{timestamp}_{cleaned_name}.pdf
  const ts = Date.now()
  const cleanedName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'invoice.pdf'
  const objectPath = `${auth.rep.id}/${ts}_${cleanedName}`

  const bytes = await file.arrayBuffer()
  const { error: uploadErr } = await admin.storage
    .from('rep-invoices')
    .upload(objectPath, bytes, { contentType: 'application/pdf', upsert: false })

  if (uploadErr) {
    return NextResponse.json({ ok: false, error: `Upload failed: ${uploadErr.message}` }, { status: 500 })
  }

  const { data: inserted, error: insertErr } = await admin.from('rep_invoices').insert({
    rep_id: auth.rep.id,
    invoice_number: invoiceNumber,
    amount,
    period_label: periodLabel,
    notes,
    document_path: objectPath,
    document_name: file.name.slice(0, 160),
    status: 'submitted',
  }).select('id, due_at').maybeSingle()

  if (insertErr || !inserted) {
    // Clean up the orphaned upload so we don't leave a file with no row.
    await admin.storage.from('rep-invoices').remove([objectPath]).catch(() => {})
    return NextResponse.json({ ok: false, error: insertErr?.message ?? 'Could not save invoice.' }, { status: 500 })
  }

  // Best-effort operator alert so admin knows to process + pay within 14 days.
  sendAdminTelegram(
    `🧾 New rep invoice submitted\n` +
    `Rep: ${auth.rep.full_name}\n` +
    `${invoiceNumber ? `Invoice: ${invoiceNumber}\n` : ''}` +
    `${amount !== null ? `Amount: $${amount.toLocaleString('en-AU')}\n` : ''}` +
    `Due within 14 days. Review in Admin → Rep Invoices.`,
  ).catch(() => {})

  return NextResponse.json({ ok: true, id: inserted.id, due_at: inserted.due_at })
}
