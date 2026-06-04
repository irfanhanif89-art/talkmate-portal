'use client'

// Session 4B Phase B — plan-upgrade nudge. Shows only when the API says the
// estimated monthly ROI dwarfs the plan cost. Plain numbers, no "the math
// makes sense" editorialising (council note). Renders nothing when hidden.
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X, TrendingUp } from 'lucide-react'

interface PromptData {
  show: boolean
  currentPlan?: string
  nextPlan?: string
  nextPlanCost?: number
  avgMonthlyRoi?: number
  additionalFeatures?: string[]
  upgradeUrl?: string
}

export default function UpgradePrompt() {
  const router = useRouter()
  const [data, setData] = useState<PromptData | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/dashboard/upgrade-prompt')
        if (!r.ok) return
        const d = await r.json()
        if (!cancelled && d.show) setData(d)
      } catch { /* silent */ }
    })()
    return () => { cancelled = true }
  }, [])

  const dismiss = useCallback(async () => {
    setData(null)
    try { await fetch('/api/dashboard/upgrade-prompt', { method: 'POST' }) } catch { /* silent */ }
  }, [])

  if (!data?.show) return null

  const features = (data.additionalFeatures ?? []).join(', ')
  const nextPlanLabel = (data.nextPlan ?? '').replace(/^\w/, c => c.toUpperCase())

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border border-l-4 border-l-[#E8622A] bg-card p-4">
      <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-[#E8622A]" />
      <div className="flex-1">
        <div className="font-semibold text-foreground">
          TalkMate is recovering an estimated ${data.avgMonthlyRoi?.toLocaleString()}/month for you.
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          Upgrading to {nextPlanLabel} (${data.nextPlanCost}/month) adds {features}.
        </div>
        <button
          onClick={() => router.push(data.upgradeUrl ?? '/settings/billing')}
          className="mt-2 rounded-md bg-[#E8622A] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          View upgrade options →
        </button>
      </div>
      <button aria-label="Dismiss" onClick={dismiss} className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
