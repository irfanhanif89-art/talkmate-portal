'use client'

// Session 4B — Agent Insights. Read-mostly surface: unanswered-question gaps
// (one-tap add to KB) + calls flagged for a closer look (frustration detected
// in the existing scoring pass). Works in the client portal and, via
// adminClientId, the admin-as-client view.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lightbulb, AlertTriangle, Plus, Loader2 } from 'lucide-react'

interface Gap {
  id: string
  question: string
  context: string | null
  detected_at: string
  call_id: string | null
  calls?: { started_at: string | null; duration_seconds: number | null; caller_number: string | null } | null
}

interface FlaggedCall {
  id: string
  started_at: string | null
  duration_seconds: number | null
  caller_number: string | null
  intelligence_flags: Array<{ type: string; detail: string }> | null
  intelligence_summary: string | null
  needs_review_at: string | null
}

function qs(adminClientId?: string) {
  return adminClientId ? `?adminClientId=${adminClientId}` : ''
}

function maskPhone(raw: string | null): string {
  if (!raw) return 'Unknown'
  const d = raw.replace(/[^0-9]/g, '')
  if (d.length < 7) return raw
  return `${d.slice(0, 4)} XXX ${d.slice(-3)}`
}

function fmtWhen(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  } catch { return '' }
}

const FLAG_LABELS: Record<string, string> = {
  caller_frustrated: 'Caller frustrated',
  no_resolution: 'No resolution',
  missed_lead: 'Missed lead',
  agent_error: 'Agent error',
  short_call: 'Short call',
}

export default function InsightsView({ adminClientId }: { adminClientId?: string }) {
  const router = useRouter()
  const [gaps, setGaps] = useState<Gap[]>([])
  const [calls, setCalls] = useState<FlaggedCall[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [g, c] = await Promise.all([
        fetch(`/api/transcript/gaps${qs(adminClientId)}`),
        fetch(`/api/insights/flagged-calls${qs(adminClientId)}`),
      ])
      if (g.ok) { const d = await g.json(); setGaps(Array.isArray(d.gaps) ? d.gaps : []) }
      if (c.ok) { const d = await c.json(); setCalls(Array.isArray(d.calls) ? d.calls : []) }
    } finally {
      setLoading(false)
    }
  }, [adminClientId])

  useEffect(() => { void load() }, [load])

  const actGap = useCallback(async (id: string, action: 'dismiss' | 'add_to_kb') => {
    setBusyId(id)
    try {
      const r = await fetch(`/api/transcript/gaps/${id}${qs(adminClientId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (r.ok) {
        setGaps(prev => prev.filter(x => x.id !== id))
        if (action === 'add_to_kb' && !adminClientId) router.push('/train')
      }
    } finally {
      setBusyId(null)
    }
  }, [adminClientId, router])

  const addAll = useCallback(async () => {
    for (const g of gaps) { await actGap(g.id, 'add_to_kb') }
  }, [gaps, actGap])

  const markReviewed = useCallback(async (id: string) => {
    setBusyId(id)
    try {
      const r = await fetch(`/api/insights/flagged-calls/${id}${qs(adminClientId)}`, { method: 'PATCH' })
      if (r.ok) setCalls(prev => prev.filter(x => x.id !== id))
    } finally {
      setBusyId(null)
    }
  }, [adminClientId])

  if (loading) {
    return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading insights…</div>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><Lightbulb className="h-6 w-6 text-amber-500" /> Agent Insights</h1>
        <p className="mt-1 text-sm text-muted-foreground">Questions your agent couldn&apos;t answer, and calls that need a closer look.</p>
      </div>

      {/* Section 1 — Unanswered questions */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Unanswered Questions</h2>
          {gaps.length >= 3 && (
            <button onClick={addAll} className="rounded-md bg-[#E8622A] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
              Add all to training
            </button>
          )}
        </div>
        {gaps.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Your agent is handling all questions well. Check back after more calls.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">Tap to add them to your knowledge base so your agent can answer next time.</p>
            <div className="space-y-3">
              {gaps.map(g => (
                <div key={g.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="text-xs text-muted-foreground">{fmtWhen(g.calls?.started_at ?? g.detected_at)}</div>
                  <div className="mt-1 text-sm text-muted-foreground">A customer asked:</div>
                  <div className="font-semibold text-foreground">{g.question}</div>
                  {g.context && <div className="mt-1 line-clamp-2 text-sm italic text-muted-foreground">&ldquo;{g.context}&rdquo;</div>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button disabled={busyId === g.id} onClick={() => actGap(g.id, 'add_to_kb')}
                      className="inline-flex items-center gap-1 rounded-md bg-[#E8622A] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                      <Plus className="h-3.5 w-3.5" /> Add to Training
                    </button>
                    <button disabled={busyId === g.id} onClick={() => actGap(g.id, 'dismiss')}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50">
                      Dismiss
                    </button>
                    <button disabled={busyId === g.id} onClick={() => actGap(g.id, 'dismiss')}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50">
                      Already covered
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Section 2 — Calls needing a closer look */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground"><AlertTriangle className="h-5 w-5 text-amber-500" /> Calls needing a closer look</h2>
        {calls.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">No calls flagged for review. Your agent is handling callers well.</p>
        ) : (
          <div className="space-y-3">
            {calls.map(c => {
              const tags = (c.intelligence_flags ?? []).map(f => FLAG_LABELS[f.type] ?? f.type)
              return (
                <div key={c.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-foreground">{fmtWhen(c.started_at ?? c.needs_review_at)}</div>
                    <div className="text-xs text-muted-foreground">{maskPhone(c.caller_number)} · {c.duration_seconds ?? 0}s</div>
                  </div>
                  {c.intelligence_summary && <div className="mt-1 text-sm text-muted-foreground">{c.intelligence_summary}</div>}
                  {tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tags.map((t, i) => (
                        <span key={i} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3">
                    <button disabled={busyId === c.id} onClick={() => markReviewed(c.id)}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50">
                      Mark reviewed
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
