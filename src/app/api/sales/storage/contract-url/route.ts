import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSalesRep } from '@/lib/sales-auth'

export async function GET(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data: contract } = await admin
    .from('rep_contracts')
    .select('document_path')
    .eq('rep_id', auth.rep.id)
    .in('status', ['pending_signature', 'signed'])
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!contract?.document_path) {
    return NextResponse.json({ ok: false, error: 'No contract on file' }, { status: 404 })
  }

  // 1-hour signed URL (3600 seconds).
  const { data: signed, error } = await admin.storage
    .from('rep-contracts')
    .createSignedUrl(contract.document_path, 3600)

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Could not generate URL' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, url: signed.signedUrl, expires_in: 3600 })
}
