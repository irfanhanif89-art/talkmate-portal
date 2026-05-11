import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Resolve the calling user's client_id (= their business.id) for any
// /api/portal/* route. Returns either a NextResponse to short-circuit
// the handler (401/404) or an `{ ok: true, supabase, clientId }` tuple
// the handler can use directly.
//
// Pattern:
//   const auth = await requireClient()
//   if ('error' in auth) return auth.error
//   const { supabase, clientId } = auth
export async function requireClient(): Promise<
  | { error: NextResponse }
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; clientId: string; userId: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (!biz) {
    return { error: NextResponse.json({ error: 'No business associated with this account' }, { status: 404 }) }
  }
  return { ok: true, supabase, clientId: biz.id as string, userId: user.id }
}
