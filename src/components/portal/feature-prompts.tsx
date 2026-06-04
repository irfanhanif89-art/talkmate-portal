'use client'

// Session 4B — contextual feature-discovery cards on the dashboard. Renders
// nothing when there are no prompts (zero height).
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

interface Prompt {
  key: string
  title: string
  body: string
  actionLabel: string
  actionPath: string
}

export default function FeaturePrompts() {
  const router = useRouter()
  const [prompts, setPrompts] = useState<Prompt[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/dashboard/feature-prompts')
        if (!r.ok) return
        const d = await r.json()
        if (!cancelled && Array.isArray(d.prompts)) setPrompts(d.prompts)
      } catch { /* silent */ }
    })()
    return () => { cancelled = true }
  }, [])

  const dismiss = useCallback(async (key: string) => {
    setPrompts(prev => prev.filter(p => p.key !== key))
    try {
      await fetch('/api/dashboard/feature-prompts/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
    } catch { /* silent */ }
  }, [])

  if (prompts.length === 0) return null

  return (
    <div className="space-y-3">
      {prompts.map(p => (
        <div key={p.key} className="flex items-start gap-3 rounded-lg border border-border border-l-4 border-l-amber-500 bg-card p-4">
          <div className="flex-1">
            <div className="font-semibold text-foreground">{p.title}</div>
            <div className="mt-0.5 text-sm text-muted-foreground">{p.body}</div>
            <button
              onClick={() => router.push(p.actionPath)}
              className="mt-2 rounded-md bg-[#E8622A] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              {p.actionLabel}
            </button>
          </div>
          <button aria-label="Dismiss" onClick={() => dismiss(p.key)} className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
