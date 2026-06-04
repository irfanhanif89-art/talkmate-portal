// Session 4B — mark a flagged call reviewed (clears the review queue state).
// PATCH, cookie/admin/Bearer auth.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveBusinessId } from '@/lib/resolve-business'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const adminClientId = url.searchParams.get('adminClientId')
  const resolved = await resolveBusinessId(adminClientId, req)
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('calls')
    .update({ needs_review: false, reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', resolved.businessId)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
