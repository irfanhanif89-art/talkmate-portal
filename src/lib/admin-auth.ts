import { createClient } from '@/lib/supabase/server'

// Shared admin gate. Mirrors the pattern used elsewhere in /api/admin/*:
// the super-admin email is hello@talkmate.com.au (also INTERNAL_ALERT_EMAIL)
// and any user with users.role = 'admin' is allowed in.
export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401, error: 'Unauthorized' }

  const { data: userProfile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isSuperAdmin =
    user.email === process.env.INTERNAL_ALERT_EMAIL ||
    user.email === 'hello@talkmate.com.au'

  if (userProfile?.role !== 'admin' && !isSuperAdmin) {
    return { ok: false as const, status: 403, error: 'Admin only' }
  }

  return { ok: true as const, user }
}

// Plan → AUD/month price. Source of truth lives here so the admin
// "Create new client" modal, the payment-link generator, and the billing
// tab all agree.
export const PLAN_PRICE_AUD: Record<'starter' | 'growth' | 'pro', number> = {
  starter: 299,
  growth: 499,
  pro: 799,
}

export type AdminPlan = keyof typeof PLAN_PRICE_AUD

export function isAdminPlan(value: unknown): value is AdminPlan {
  return value === 'starter' || value === 'growth' || value === 'pro'
}

// 10-char alphanumeric mixed case. Excludes 0/O/1/l for legibility on a
// hand-written or copy-pasted SMS — Irfan reads these out to clients.
export function generateTempPassword(length = 10): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return out
}
