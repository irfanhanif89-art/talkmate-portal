// EOFY 50%-off sale — DISPLAY ONLY. Net price charged (pricing.ts / Stripe) is
// unchanged. "regular" = net × 2, shown struck through. isSaleActive() auto-reverts
// every surface after the end date with no deploy.

export const EOFY_SALE = {
  label: 'EOFY Sale',
  discountPercent: 50,
  regularMultiplier: 2,
  endsAt: new Date('2026-06-30T23:59:59+10:00'),
  badge: '50% OFF · EOFY SALE · ENDS JUNE 30',
} as const

export function isSaleActive(now: Date = new Date()): boolean {
  return now.getTime() <= EOFY_SALE.endsAt.getTime()
}

export function regularPrice(net: number): number {
  return net * EOFY_SALE.regularMultiplier
}

// Inject struck-through "regular" pricing into the static proposal HTML when the
// sale is active. Matches the hardcoded pricing cards in towing-proposal.html.
export function applyEofySaleToProposalHtml(html: string, now: Date = new Date()): string {
  if (!isSaleActive(now)) return html

  // 1. Prepend a struck-through regular monthly above each <div class="plan-price">$N</div>
  let out = html.replace(
    /<div class="plan-price">\$(\d{1,3}(?:,\d{3})*)<\/div>/g,
    (full: string, num: string) => {
      const net = Number(num.replace(/,/g, ''))
      const reg = regularPrice(net)
      return `<div class="plan-was">$${reg.toLocaleString('en-AU')}</div>${full}`
    },
  )

  // 2. Prepend a struck-through regular annual inside the plan-annual line.
  out = out.replace(
    /<div class="plan-annual">or \$(\d{1,3}(?:,\d{3})*)\/yr/g,
    (full: string, num: string) => {
      const net = Number(num.replace(/,/g, ''))
      const reg = regularPrice(net)
      return `<div class="plan-annual">or <span class="plan-annual-was">$${reg.toLocaleString('en-AU')}</span> $${num}/yr`
    },
  )

  // 3. Add a sale banner immediately before the plans intro.
  out = out.replace(
    /<p class="plans-intro">/,
    `<p class="eofy-banner">${EOFY_SALE.badge}</p>\n      <p class="plans-intro">`,
  )

  return out
}
