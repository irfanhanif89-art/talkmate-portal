import { NextResponse } from 'next/server'
import { createClient, createAdminClient, createBearerClient } from '@/lib/supabase/server'

// Resolve the calling user's client_id (= their business.id) for any
// /api/portal/* route. Returns either a NextResponse to short-circuit
// the handler (401/404) or an `{ ok: true, supabase, clientId }` tuple
// the handler can use directly.
//
// Accepts EITHER:
//   - the SSR cookie session (web portal, default — call requireClient()), OR
//   - Authorization: Bearer <supabase-access-jwt> (mobile app — pass the
//     Request: requireClient(req)). The Bearer path verifies the JWT via the
//     service-role client, then returns a JWT-BOUND anon client so all queries
//     still run under RLS (same tenant isolation as the cookie path).
//
// The Bearer branch is purely additive: existing requireClient() callers
// (web) are unchanged because `req` is undefined.
//
// Pattern:
//   const auth = await requireClient(req)   // req optional
//   if ('error' in auth) return auth.error
//   const { supabase, clientId } = auth
type RequireClientResult =
  | { error: NextResponse }
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; clientId: string; userId: string }

export async function requireClient(req?: Request): Promise<RequireClientResult> {
  // Path A — Bearer token (mobile). Opt-in by passing the Request.
  if (req) {
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization')
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      const jwt = authHeader.slice(7).trim()
      if (jwt) {
        const admin = createAdminClient()
        const { data, error } = await admin.auth.getUser(jwt)
        if (error || !data?.user) {
          return { error: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }) }
        }
        // JWT-bound anon client → RLS applies as this user.
        const supabase = createBearerClient(jwt) as unknown as Awaited<ReturnType<typeof createClient>>
        const { data: biz } = await supabase
          .from('businesses')
          .select('id')
          .eq('owner_user_id', data.user.id)
          .maybeSingle()
        if (!biz) {
          return { error: NextResponse.json({ error: 'No business associated with this account' }, { status: 404 }) }
        }
        return { ok: true, supabase, clientId: biz.id as string, userId: data.user.id }
      }
    }
  }

  // Path B — SSR cookie session (web portal, default).
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
