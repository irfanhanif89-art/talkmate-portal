// GET /api/portal/contacts — mobile contacts list for the business owner.
// Bearer (or cookie) via requireClient. Returns non-merged contacts newest
// activity first. The mobile screen does its own search/tag filtering.

import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

const MAX_LIMIT = 500

export async function GET(request: Request) {
  const auth = await requireClient(request)
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '300', 10) || 300, MAX_LIMIT)

  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, phone, email, first_seen, last_seen, call_count, notes, tags')
    .eq('client_id', clientId)
    .or('is_merged.is.null,is_merged.eq.false')
    .order('last_seen', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contacts: data ?? [] })
}
