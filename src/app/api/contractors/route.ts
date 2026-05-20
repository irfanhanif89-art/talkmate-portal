import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('contractors')
    .select('id, first_name, last_name, email, phone, abn, status, agreement_signed_at, signed_pdf_url, created_at, invite_expires_at, termination_date')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, contractors: data ?? [] })
}
