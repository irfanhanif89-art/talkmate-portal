// Demo system configuration
// Single source of truth for all demo-related constants.
// Backed by migration 059_demo_system.sql and the businesses row at DEMO_BUSINESS_IDS.towing.

export type DemoIndustryKey =
  | 'towing'
  | 'hospitality'
  | 'trades'
  | 'realestate'
  | 'medical'
  | 'legal'
  | 'automotive'
  | 'beauty'
  | 'fitness'
  | 'cleaning'
  | 'childcare'
  | 'finance'
  | 'veterinary'

export const DEMO_BUSINESS_IDS: Partial<Record<DemoIndustryKey, string>> = {
  // Repurposed existing business owned by hello@talkmate.com.au (UNIQUE owner_user_id).
  // See migration 059.
  towing: 'ad380eb3-a0b5-4566-9107-e0b075ac48e8',
}

export type DemoIndustry = {
  key: DemoIndustryKey
  label: string
  description: string
  available: boolean
}

export const DEMO_INDUSTRIES: DemoIndustry[] = [
  { key: 'towing',      label: 'Towing & Roadside',        description: 'Tow truck dispatch, battery jumps, tyre changes, lockouts',  available: true  },
  { key: 'hospitality', label: 'Restaurants & Cafes',      description: 'Table bookings, takeaway orders, opening hours',             available: false },
  { key: 'trades',      label: 'Trades & Services',        description: 'Job bookings, quotes, callouts',                             available: false },
  { key: 'realestate',  label: 'Real Estate',              description: 'Inspection bookings, appraisal requests, tenant enquiries',  available: false },
  { key: 'medical',     label: 'Medical & Allied Health',  description: 'Appointment bookings, recalls, after-hours triage',          available: false },
  { key: 'legal',       label: 'Legal Services',           description: 'Consultation bookings, matter enquiries',                    available: false },
  { key: 'automotive',  label: 'Automotive',               description: 'Service bookings, parts enquiries',                          available: false },
  { key: 'beauty',      label: 'Beauty & Wellness',        description: 'Appointment bookings, service enquiries',                    available: false },
  { key: 'fitness',     label: 'Fitness & Sport',          description: 'Class bookings, memberships, timetables',                    available: false },
  { key: 'cleaning',    label: 'Cleaning Services',        description: 'Quote requests, job bookings',                               available: false },
  { key: 'childcare',   label: 'Childcare',                description: 'Enrolment enquiries, session bookings',                      available: false },
  { key: 'finance',     label: 'Finance & Accounting',     description: 'Consultation bookings, document requests',                   available: false },
  { key: 'veterinary',  label: 'Veterinary',               description: 'Appointment bookings, after-hours triage',                   available: false },
]

export function getDemoIndustry(key: string): DemoIndustry | undefined {
  return DEMO_INDUSTRIES.find((i) => i.key === key)
}

export function getDemoBusinessId(industry: string): string | undefined {
  return DEMO_BUSINESS_IDS[industry as DemoIndustryKey]
}

// Server-only token guard for /sales-demo/[industry].
// Set DEMO_PORTAL_SECRET in Vercel env. Public mirror NEXT_PUBLIC_DEMO_PORTAL_TOKEN
// holds the same value so the rep-side client can append it to the demo URL.
export function getDemoPortalSecret(): string {
  return process.env.DEMO_PORTAL_SECRET ?? ''
}

export function validateDemoPortalToken(token: string | null | undefined): boolean {
  const secret = getDemoPortalSecret()
  if (!secret) return false
  if (!token) return false
  return token === secret
}

// Snapshot of the canonical demo business state.
// The reset-demo-business cron restores these fields every 4 hours so that one rep's
// edits during a demo do not bleed into the next rep's demo.
// Keep in sync with migration 059_demo_system.sql.
export type DemoBusinessSnapshot = {
  id: string
  name: string
  business_type: string
  industry: string
  phone_number: string
  address: string
  plan: string
  account_status: string
  greeting: string
  services: Array<{
    id: string
    name: string
    description: string
    price: number
    duration_minutes: number
    active: boolean
  }>
}

export const DEMO_TOWING_SNAPSHOT: DemoBusinessSnapshot = {
  id: 'ad380eb3-a0b5-4566-9107-e0b075ac48e8',
  name: 'Gold Coast Towing (Demo)',
  business_type: 'towing',
  industry: 'towing',
  phone_number: '+61400000000',
  address: '1 Demo Street, Southport QLD 4215',
  plan: 'growth',
  account_status: 'active',
  greeting: 'Thanks for calling Gold Coast Towing, this is Sarah. How can I help you?',
  services: [
    { id: 'svc-tow',     name: 'Tow Truck Dispatch',  description: 'Standard tow to any location on the Gold Coast and surrounds', price: 120, duration_minutes: 60, active: true },
    { id: 'svc-jump',    name: 'Battery Jump Start',  description: 'On-site battery jump start, any location',                     price: 85,  duration_minutes: 30, active: true },
    { id: 'svc-tyre',    name: 'Tyre Change',         description: 'Roadside tyre change with your spare',                         price: 95,  duration_minutes: 45, active: true },
    { id: 'svc-lockout', name: 'Lockout Service',     description: 'Vehicle lockout assistance, non-destructive entry',            price: 110, duration_minutes: 30, active: true },
    { id: 'svc-fuel',    name: 'Fuel Delivery',       description: 'Emergency fuel delivery, up to 10L',                           price: 75,  duration_minutes: 20, active: true },
  ],
}

export const DEMO_BUSINESS_SNAPSHOTS: Record<string, DemoBusinessSnapshot> = {
  towing: DEMO_TOWING_SNAPSHOT,
}
