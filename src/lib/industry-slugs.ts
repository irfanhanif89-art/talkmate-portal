// Canonical industry slugs for sales-side features (proposal generator,
// demo launcher, hit-list). Leads come from many sources and the
// industry field is free-form; SALES_INDUSTRY_SLUGS is the closed set
// the proposal templates and Vapi demo agents key off.

export const SALES_INDUSTRY_SLUGS = [
  'towing', 'restaurants', 'real_estate', 'trades', 'healthcare',
  'plumbing', 'electrical', 'hvac', 'ndis', 'retail',
  'professional', 'beauty', 'gym', 'auto',
] as const

export type SalesIndustrySlug = typeof SALES_INDUSTRY_SLUGS[number]

const SLUG_ALIASES: Record<string, SalesIndustrySlug> = {
  restaurant: 'restaurants',
  realestate: 'real_estate',
  professional_services: 'professional',
  mechanic: 'auto',
  medispa: 'beauty',
}

export function toSalesIndustrySlug(input: string | null | undefined): SalesIndustrySlug | null {
  if (!input) return null
  const lower = input.toLowerCase().trim()
  if ((SALES_INDUSTRY_SLUGS as readonly string[]).includes(lower)) {
    return lower as SalesIndustrySlug
  }
  return SLUG_ALIASES[lower] ?? null
}

export const SALES_INDUSTRY_LABELS: Record<SalesIndustrySlug, string> = {
  towing:       'Towing',
  restaurants:  'Restaurants',
  real_estate:  'Real Estate',
  trades:       'Trades',
  healthcare:   'Healthcare',
  plumbing:     'Plumbing',
  electrical:   'Electrical',
  hvac:         'HVAC',
  ndis:         'NDIS',
  retail:       'Retail',
  professional: 'Professional Services',
  beauty:       'Beauty',
  gym:          'Gym',
  auto:         'Auto',
}
