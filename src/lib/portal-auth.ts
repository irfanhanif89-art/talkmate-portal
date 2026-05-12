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

// Dispatch is a Pro-only feature gated by both:
//   - businesses.plan in ('pro', 'professional')
//   - businesses.dispatch_enabled = true
//
// Every /api/portal/dispatch/*, /api/portal/vehicles, /api/portal/drivers
// handler should call this instead of requireClient() so neither check
// can be forgotten on a new sub-route.
export async function requireDispatchAccess(): Promise<
  | { error: NextResponse }
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; clientId: string; userId: string }
> {
  const base = await requireClient()
  if ('error' in base) return base
  const { supabase, clientId } = base

  const { data: biz } = await supabase
    .from('businesses')
    .select('plan, dispatch_enabled')
    .eq('id', clientId)
    .maybeSingle()

  const plan = (biz?.plan as string | undefined) ?? 'starter'
  const isPro = plan === 'pro' || plan === 'professional'
  const enabled = !!biz?.dispatch_enabled

  if (!isPro || !enabled) {
    return {
      error: NextResponse.json(
        {
          error: 'dispatcher_not_enabled',
          message: 'Dispatcher is available on the Pro plan only.',
        },
        { status: 403 },
      ),
    }
  }
  return base
}
