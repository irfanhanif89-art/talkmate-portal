// Server-side template filling. Replaces the inner content of ANY <tag data-tm="key">…</tag>
// node (span/div/a/…) with escaped values, keeps tel:/mailto: hrefs pointing at the real
// value, and moves the featured ".pf" plan styling to the chosen plan.
// Template plan cards MUST carry data-plan="starter|growth|pro" (added in Task 6).

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;')
}

export function fillTemplate(html: string, values: Record<string, string | null | undefined>): string {
  return html.replace(
    /<(\w+)([^>]*\bdata-tm="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g,
    (full, tag: string, attrs: string, key: string, _inner: string) => {
      if (!(key in values) || values[key] == null) return full
      const val = String(values[key])
      let openAttrs = attrs
      // Keep contact links (confirmation page) pointing at the real value.
      if (/href="tel:[^"]*"/.test(openAttrs)) {
        openAttrs = openAttrs.replace(/href="tel:[^"]*"/, `href="tel:${val.replace(/\s+/g, '')}"`)
      } else if (/href="mailto:[^"]*"/.test(openAttrs)) {
        openAttrs = openAttrs.replace(/href="mailto:[^"]*"/, `href="mailto:${val}"`)
      }
      return `<${tag}${openAttrs}>${escapeHtml(val)}</${tag}>`
    },
  )
}

type Plan = 'starter' | 'growth' | 'pro'

// De-feature every plan card, then feature the chosen one (add `pf` class + badge).
export function featurePlan(html: string, plan: Plan): string {
  // 1. strip "pf" from any plan-card class and remove existing Most Popular badge
  let out = html.replace(/<div class="plan-card pf"([^>]*)>/g, '<div class="plan-card"$1>')
  out = out.replace(/<div class="plan-badge">Most Popular<\/div>\s*/g, '')
  // 2. add pf + badge to the chosen card (matched by data-plan)
  out = out.replace(
    new RegExp(`<div class="plan-card"([^>]*\\bdata-plan="${plan}"[^>]*)>`),
    `<div class="plan-card pf"$1><div class="plan-badge">Most Popular</div>`,
  )
  return out
}
