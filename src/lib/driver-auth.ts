import { createClient } from '@/lib/supabase/server'

// Sessions 36-37 — driver-side equivalent of requireSalesRep. Used by
// every /api/driver/* route that needs to scope queries to "this
// driver". Mirrors the shape of requireSalesRep so the pattern is
// familiar to anyone reading sales-auth.ts.

export interface DriverRow {
  id: string
  user_id: string
  client_id: string
  name: string
  phone: string
  email: string | null
  truck_type: string | null
  truck_rego: string | null
  licence_number: string | null
  is_available: boolean
  is_online: boolean
  is_active: boolean
  notes: string | null
  avatar_url: string | null
  location_consent_at: string | null
}

export async function requireDriver(): Promise<
  | { ok: true; user: { id: string; email?: string | null }; driver: DriverRow }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }

  const { data: driver } = await supabase
    .from('drivers')
    .select('id, user_id, client_id, name, phone, email, truck_type, truck_rego, licence_number, is_available, is_online, is_active, notes, avatar_url, location_consent_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!driver) {
    return { ok: false, status: 403, error: 'Driver account required' }
  }
  if (!driver.is_active) {
    return { ok: false, status: 403, error: 'Your driver account has been deactivated' }
  }

  return { ok: true, user: { id: user.id, email: user.email }, driver: driver as DriverRow }
}
