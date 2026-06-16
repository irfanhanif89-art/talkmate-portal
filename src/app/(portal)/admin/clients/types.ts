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
  account_status: 'trial' | 'active' | 'pending' | 'pending_payment' | 'expired' | 'suspended' | 'cancelled' | null
  onboarded_by: 'self' | 'admin' | 'partner' | 'sales_rep' | null
  sales_rep_id?: string | null
  sales_rep_name?: string | null
  // Session 6 — trial mode lifecycle
  trial_start_date: string | null
  trial_end_date: string | null
  trial_converted_at: string | null
  // Session 6 — admin "all info captured, brief Donna" flag (distinct
  // from the existing `onboarding_completed` boolean, which tracks the
  // client's self-onboarding wizard).
  onboarding_complete: boolean | null
  onboarding_complete_at: string | null
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
  // Migration 020 — industry service fields
  services: Array<{
    id: string
    name: string
    price: string
    unit: string
    enabled: boolean
    custom: boolean
  }> | null
  trade_type: string | null
  // Session 19 — SMS usage shown as the "SMS / Mo" column in the admin
  // client list. Null on rows that pre-date migration 031's counter.
  sms_used_this_month?: number | null
  // Session 20 — Go-Live verification status (admin only). Set to true
  // when every auto + manual checklist item passes.
  golive_verified?: boolean | null
  golive_verified_at?: string | null
  // Session 22 — billing cycle + setup fee tracking
  billing_cycle?: 'monthly' | 'annual' | null
  setup_fee_waived?: boolean | null
  setup_fee_amount?: number | null
  // Sprint Session 1 follow-up — admin clients list adds 4 new columns
  // sourced from migrations 060-062. unread_sms is aggregated server-side
  // by the page, the rest come directly off the businesses row.
  kb_sync_status?: 'synced' | 'pending' | 'syncing' | 'error' | null
  winback_enabled?: boolean | null
  review_requests_enabled?: boolean | null
  unread_sms?: number
  // Session 4A — onboarding intelligence columns (migration 074).
  // agent_name here is the businesses.agent_name COLUMN (the editable display
  // name), distinct from notifications_config.agent_name used in Agent Setup.
  agent_name?: string | null
  integration_mode?: 'overflow' | 'after_hours' | 'full_time' | null
  go_live_gate_passed?: boolean | null
  // Server-computed go-live readiness percent (null when no checklist row).
  readiness_percent?: number | null
  // Session 6C — admin clients-list columns sourced off the businesses row.
  servicem8_enabled?: boolean | null
  industry_pack_applied?: string | null
  // Session 78 — integration connection flags (read-only chips on the list).
  zapier_webhook_url?: string | null
  hubspot_access_token?: string | null
  myob_access_token?: string | null
  google_business_location_id?: string | null
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
  { value: 'locksmith', label: 'Locksmith & Security' },
  { value: 'other', label: 'Other' },
]

export const PLAN_OPTIONS: Array<{ value: 'starter' | 'growth' | 'pro'; label: string; price: number; recommended?: boolean }> = [
  { value: 'starter', label: 'Starter', price: 299 },
  { value: 'growth', label: 'Growth', price: 499, recommended: true },
  { value: 'pro', label: 'Pro', price: 799 },
]

export function statusColor(s: AdminBusiness['account_status']): string {
  if (s === 'trial') return '#E8622A'
  if (s === 'active') return '#22C55E'
  if (s === 'pending') return '#F59E0B'
  if (s === 'expired') return '#EF4444'
  if (s === 'suspended') return '#EF4444'
  if (s === 'cancelled') return '#6B7280'
  return '#7BAED4'
}

export function statusLabel(s: AdminBusiness['account_status']): string {
  if (!s) return 'Unknown'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Days remaining on a trial, or null if not on trial / no end date.
// Returns 0 (not negative) for trials whose end date has already passed.
export function trialDaysRemaining(end: string | null): number | null {
  if (!end) return null
  const ms = new Date(end).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

export function planLabel(p: string | null): string {
  if (!p) return '—'
  if (p === 'pro') return 'Pro'
  return p.charAt(0).toUpperCase() + p.slice(1)
}

// Legacy keys used by businesses created before the library-aligned update.
const LEGACY_INDUSTRY_LABELS: Record<string, string> = {
  restaurants: 'Restaurants & Hospitality',
  real_estate: 'Real Estate',
  professional_services: 'Professional Services',
  // Library-aligned keys not in the original INDUSTRIES list:
  restaurant: 'Restaurant & Takeaway',
  realestate: 'Real Estate',
  dental: 'Dental Practice',
  medispa: 'Medi-Spa & Beauty',
  mechanic: 'Mechanic & Automotive',
  physio: 'Physio & Allied Health',
  accounting: 'Accounting & Bookkeeping',
  cleaning: 'Cleaning Services',
  pest: 'Pest Control',
  landscaping: 'Landscaping & Gardens',
  locksmith: 'Locksmith & Security',
}

export function industryLabel(i: string | null): string {
  if (!i) return '—'
  return INDUSTRIES.find(x => x.value === i)?.label
    ?? LEGACY_INDUSTRY_LABELS[i]
    ?? i.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function planAud(p: string | null): number {
  if (p === 'pro') return 799
  if (p === 'growth') return 499
  if (p === 'starter') return 299
  return 0
}
