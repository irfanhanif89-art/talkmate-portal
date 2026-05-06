// Shared types for the admin Client Management surface.

export interface AdminBusiness {
  id: string
  name: string
  phone_number: string | null
  address: string | null
  website: string | null
  abn: string | null
  industry: string | null
  plan: string | null
  account_status: 'active' | 'pending' | 'suspended' | 'cancelled' | null
  onboarded_by: 'self' | 'admin' | 'partner' | null
  agent_status: string | null
  agent_phone_number: string | null
  welcome_email_sent: boolean | null
  stripe_payment_link: string | null
  stripe_customer_id: string | null
  billing_override_note: string | null
  manual_next_billing_date: string | null
  onboarding_completed: boolean | null
  owner_user_id: string
  tos_accepted_at: string | null
  tos_accepted_version: string | null
  temp_password: string | null
  created_at: string
  signup_at: string | null
  notifications_config: Record<string, unknown> | null
}

export interface PartnerOption {
  id: string
  name: string
}

export const INDUSTRIES: Array<{ value: string; label: string }> = [
  { value: 'restaurants', label: 'Restaurants & Hospitality' },
  { value: 'towing', label: 'Towing & Transport' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'trades', label: 'Trades' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'ndis', label: 'NDIS Services' },
  { value: 'retail', label: 'Retail' },
  { value: 'professional_services', label: 'Professional Services' },
  { value: 'other', label: 'Other' },
]

export const PLAN_OPTIONS: Array<{ value: 'starter' | 'growth' | 'pro'; label: string; price: number; recommended?: boolean }> = [
  { value: 'starter', label: 'Starter', price: 299 },
  { value: 'growth', label: 'Growth', price: 499, recommended: true },
  { value: 'pro', label: 'Pro', price: 799 },
]

export function statusColor(s: AdminBusiness['account_status']): string {
  if (s === 'active') return '#22C55E'
  if (s === 'pending') return '#F59E0B'
  if (s === 'suspended') return '#EF4444'
  if (s === 'cancelled') return '#6B7280'
  return '#7BAED4'
}

export function statusLabel(s: AdminBusiness['account_status']): string {
  if (!s) return 'Unknown'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function planLabel(p: string | null): string {
  if (!p) return '—'
  if (p === 'pro' || p === 'professional') return 'Pro'
  return p.charAt(0).toUpperCase() + p.slice(1)
}

export function industryLabel(i: string | null): string {
  if (!i) return '—'
  return INDUSTRIES.find(x => x.value === i)?.label ?? i
}

export function planAud(p: string | null): number {
  if (p === 'pro' || p === 'professional') return 799
  if (p === 'growth') return 499
  if (p === 'starter') return 299
  return 0
}
