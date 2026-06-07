import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/contacts/[id]/calls
// Returns the call history for a single contact, scoped to the authenticated
// business. Used by the Customers page detail panel.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  // Verify the contact belongs to this business
  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (!business) return NextResponse.json({ ok: false }, { status: 404 })

  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('id', id)
    .eq('client_id', business.id)
    .single()
  if (!contact) return NextResponse.json({ ok: false }, { status: 404 })

  const { data: calls } = await supabase
    .from('contact_calls')
    .select('id, call_id, call_at, duration_seconds, outcome, summary, tags_applied')
    .eq('contact_id', id)
    .order('call_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ ok: true, calls: calls ?? [] })
}
