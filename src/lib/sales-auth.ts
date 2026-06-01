import { cache } from 'react'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const SALES_REP_COLUMNS =
  'id, user_id, full_name, email, phone, team_id, status, commission_policy_version, policy_acknowledged_at, contract_signed_at, onboarded_via, contractor_id, notification_email, demo_industry, demo_calendly_url'

// Per-request memoised auth lookups. Every /sales navigation renders the
// sales layout AND the page in the SAME server request — both used to call
// supabase.auth.getUser() + select sales_reps independently, so a single tab
// click did the (network-bound) auth round-trip three times (plus once more
// in middleware). Wrapping these in React cache() collapses the layout's and
// the page's calls into ONE getUser + ONE sales_reps lookup per request,
// cutting the per-navigation latency the reps were feeling.

export const getSalesSessionUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

export const getSalesRepByUserId = cache(async (userId: string): Promise<SalesRepRow | null> => {
  const admin = createAdminClient()
  const { data: rep } = await admin
    .from('sales_reps')
    .select(SALES_REP_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()
  return (rep as SalesRepRow | null) ?? null
})

export interface SalesRepRow {
  id: string
  user_id: string
  full_name: string
  email: string
  phone: string | null
  team_id: string | null
  status: 'active' | 'inactive'
  commission_policy_version: string
  policy_acknowledged_at: string | null
  contract_signed_at: string | null
  onboarded_via: 'manual' | 'contractor_flow' | null
  contractor_id: string | null
  notification_email: string | null
  demo_industry: string | null
  demo_calendly_url: string | null
}

type RequireSalesRepResult =
  | { ok: true; user: { id: string; email?: string | null }; rep: SalesRepRow }
  | { ok: false; status: number; error: string }

// Shared sales-rep gate for /api/sales/* routes.
//
// Accepts EITHER:
//   - the SSR cookie session (web portal flow, default), OR
//   - Authorization: Bearer <supabase-access-jwt> header (mobile app, opt-in
//     by passing the Request object).
//
// The Bearer path verifies the JWT via supabase.auth.getUser(jwt) using the
// service-role client, which checks the JWT signature against Supabase's
// signing keys. NEVER trust the Bearer header without that round-trip.
export async function requireSalesRep(req?: Request): Promise<RequireSalesRepResult> {
  let userId: string | null = null
  let userEmail: string | null = null

  // Path A — Bearer token (mobile)
  if (req) {
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization')
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      const jwt = authHeader.slice(7).trim()
      if (jwt) {
        const admin = createAdminClient()
        const { data, error } = await admin.auth.getUser(jwt)
        if (error || !data?.user) {
          return { ok: false, status: 401, error: 'Invalid or expired token' }
        }
        userId = data.user.id
        userEmail = data.user.email ?? null
      }
    }
  }

  // Path B — SSR cookie (web). Uses the per-request cached lookup so the
  // sales layout and the page share a single getUser() round-trip.
  if (!userId) {
    const user = await getSalesSessionUser()
    if (!user) return { ok: false, status: 401, error: 'Unauthorized' }
    userId = user.id
    userEmail = user.email ?? null
  }

  const rep = await getSalesRepByUserId(userId)

  if (!rep) {
    return { ok: false, status: 403, error: 'Sales rep account required' }
  }
  if (rep.status !== 'active') {
    return { ok: false, status: 403, error: 'Your sales rep account has been deactivated' }
  }

  return { ok: true, user: { id: userId, email: userEmail }, rep: rep as SalesRepRow }
}
