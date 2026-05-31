// Resolves "which business is this request acting on" for routes that
// support both the client portal and the admin-as-client view.
//
// Default flow (no adminClientId): use the signed-in user's
// owner_user_id business — the standard client-portal behaviour.
//
// Admin override: when ?adminClientId=<uuid> is present (or admin=true
// + body.businessId in JSON routes), authenticate as admin and trust
// the supplied id. This is what powers the admin-portal-as-client view
// under /admin/clients/[clientId]/portal/*.

import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export interface ResolvedBusiness {
  ok: true
  businessId: string
  isAdmin: boolean
}

export interface ResolveError {
  ok: false
  status: number
  error: string
}

export type ResolveResult = ResolvedBusiness | ResolveError

// Server-side helper: pass `adminClientId` (from req.url query or body)
// to take the admin path; omit to use the owner_user_id path.
export async function resolveBusinessId(adminClientId?: string | null): Promise<ResolveResult> {
  if (adminClientId) {
    const auth = await requireAdmin()
    if (!auth.ok) return { ok: false, status: auth.status, error: auth.error }
    return { ok: true, businessId: adminClientId, isAdmin: true }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'unauthorised' }

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!business) return { ok: false, status: 404, error: 'business_not_found' }
  return { ok: true, businessId: business.id as string, isAdmin: false }
}
