'use client'

// Industry Template card — Session 3A.
// Shown at the top of the FAQ Knowledge tab when the business has fewer than 3
// active KB entries. Lets the owner pre-fill their knowledge base from an
// industry pack. Self-contained: confirm modal + fetch. On success it reloads so
// the server component re-fetches entries (and this card hides once >= 3 entries).
// Styling uses design-system tokens so it adapts to dark/light.

import { useState } from 'react'
import { Truck, Wrench, Zap, Sparkles, Wind, Briefcase } from 'lucide-react'
import { ButtonV2 } from '@/components/portal/ui-v2/button'

type Industry = 'towing' | 'plumbing' | 'electrical' | 'cleaning' | 'hvac'

const OPTIONS: { key: Industry | 'other'; label: string; Icon: typeof Truck }[] = [
  { key: 'towing', label: 'Towing', Icon: Truck },
  { key: 'plumbing', label: 'Plumbing', Icon: Wrench },
  { key: 'electrical', label: 'Electrical', Icon: Zap },
  { key: 'cleaning', label: 'Cleaning', Icon: Sparkles },
  { key: 'hvac', label: 'HVAC', Icon: Wind },
  { key: 'other', label: 'Other / Skip', Icon: Briefcase },
]

function withAdmin(path: string, adminClientId: string | null | undefined): string {
  if (!adminClientId) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}adminClientId=${encodeURIComponent(adminClientId)}`
}

export default function IndustryTemplateCard({ adminClientId }: { adminClientId?: string | null }) {
  const [confirming, setConfirming] = useState<Industry | null>(null)
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (dismissed) return null

  async function apply(industry: Industry) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(withAdmin(`/api/industry-packs/${industry}/apply`, adminClientId), { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.ok) { setError(json.error || 'Could not apply the template. Try again.'); setBusy(false); return }
      window.location.reload()
    } catch {
      setError('Network error. Try again.'); setBusy(false)
    }
  }

  function selectOption(key: Industry | 'other') {
    if (key === 'other') { setDismissed(true); return }
    setConfirming(key)
  }

  return (
    <div className="rounded-[14px] border border-orange/25 bg-orange/[.06] p-5">
      <div className="mb-1 text-[16px] font-extrabold text-text">Start with an industry template</div>
      <p className="mb-4 text-[13px] leading-relaxed text-dim">
        Pick your industry and TalkMate will pre-fill your knowledge base with common questions,
        services, and information. You can edit everything after.
      </p>

      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
        {OPTIONS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            onClick={() => selectOption(key)}
            className="flex items-center gap-2.5 rounded-[10px] border border-line bg-card-2 px-3.5 py-3 text-left text-[14px] font-semibold text-text transition hover:border-orange/40 disabled:opacity-60"
          >
            <Icon size={18} className="text-orange shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {error && <div className="mt-3 text-[13px] text-red">{error}</div>}

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-5"
          onClick={() => !busy && setConfirming(null)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[420px] rounded-[16px] border border-line-strong bg-card p-6">
            <div className="mb-2 text-[17px] font-extrabold text-text">
              Apply {OPTIONS.find((o) => o.key === confirming)?.label} template?
            </div>
            <p className="mb-5 text-[13px] leading-relaxed text-dim">
              This will add entries to your knowledge base. Anything you have already added is kept.
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(null)}
                className="rounded-[10px] border border-line-strong px-4 py-2.5 text-[14px] font-semibold text-dim transition hover:text-text disabled:opacity-60"
              >
                Cancel
              </button>
              <ButtonV2 onClick={() => apply(confirming)} disabled={busy} className="px-[18px] py-2.5 text-[14px]">
                {busy ? 'Applying…' : 'Apply template'}
              </ButtonV2>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
