import { createClient } from '@/lib/supabase/server'

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
}

// Shared sales-rep gate for /api/sales/* routes. Mirrors the
// requireAdmin() pattern in admin-auth.ts. Returns the rep row on
// success; status 401 if not authenticated, 403 if not an active rep.
export async function requireSalesRep(): Promise<
  | { ok: true; user: { id: string; email?: string | null }; rep: SalesRepRow }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }

  const { data: rep } = await supabase
    .from('sales_reps')
    .select('id, user_id, full_name, email, phone, team_id, status, commission_policy_version, policy_acknowledged_at, contract_signed_at, onboarded_via, contractor_id, notification_email')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!rep) {
    return { ok: false, status: 403, error: 'Sales rep account required' }
  }
  if (rep.status !== 'active') {
    return { ok: false, status: 403, error: 'Your sales rep account has been deactivated' }
  }

  return { ok: true, user: { id: user.id, email: user.email }, rep: rep as SalesRepRow }
}
