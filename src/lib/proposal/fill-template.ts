// Server-side template filling. Replaces the inner content of <span data-tm="key">…</span>
// nodes with escaped values, and moves the featured ".pf" plan styling to the chosen plan.
// Template plan cards MUST carry data-plan="starter|growth|pro" (added in Task 6).

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;')
}

export function fillTemplate(html: string, values: Record<string, string | null | undefined>): string {
  return html.replace(
    /(<span[^>]*\bdata-tm="([^"]+)"[^>]*>)([\s\S]*?)(<\/span>)/g,
    (full, open: string, key: string, _inner: string, close: string) => {
      if (!(key in values) || values[key] == null) return full
      return open + escapeHtml(String(values[key])) + close
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
