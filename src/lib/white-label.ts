// White-label config helpers (Session 3 brief Part 4).
// Keep all white-label types here so server pages, admin views, and the
// /wl-preview route share a single shape.

export interface WhiteLabelConfig {
  id: string
  partner_id: string | null
  brand_name: string
  brand_logo_url: string | null
  primary_color: string
  secondary_color: string
  accent_color: string
  custom_domain: string | null
  portal_subdomain: string | null
  support_email: string | null
  support_phone: string | null
  hide_talkmate_branding: boolean
  is_active: boolean
  created_at: string
}

export const WHITE_LABEL_DEFAULTS = {
  primary_color: '#E8622A',
  secondary_color: '#061322',
  accent_color: '#1565C0',
} as const

export function isPartnerTier(tier: string | null | undefined): tier is 'starter' | 'silver' | 'gold' {
  return tier === 'starter' || tier === 'silver' || tier === 'gold'
}

// Gold partners are the only tier allowed to fully white-label
// (i.e. hide TalkMate branding entirely). Silver/Starter still get
// branded login + portal, but TalkMate "Powered by" remains.
export function canHideTalkmateBranding(tier: string | null | undefined): boolean {
  return tier === 'gold'
}
