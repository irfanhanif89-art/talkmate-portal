// DELETE /api/portal/staff/[id] — owner-only. Marks the staff_members
// row inactive. We don't hard-delete because the audit history may
// reference it, and a future re-invite uses the same row via the
// (client_id, email) UNIQUE constraint.

import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const { data: biz } = await supabase
    .from('businesses').select('id').eq('owner_user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ ok: false, error: 'Owner only' }, { status: 403 })

  const { id } = await params
  const admin = createAdminClient()
  const { error } = await admin
    .from('staff_members')
    .update({ active: false })
    .eq('id', id)
    .eq('client_id', biz.id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
