'use client'

// Call Flow tab (Session 4A) — the opening intake questions the agent asks every
// caller. Logic ported verbatim from the original train-view; styling moved to
// design-system tokens. Draft-only: stored via /api/onboarding/call-flow but NOT
// synced to the live agent yet.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Save, X, RefreshCw, ArrowUp, ArrowDown } from 'lucide-react'
import { ButtonV2 } from '@/components/portal/ui-v2/button'
import { withAdmin } from './types'

interface CallFlowQuestion {
  id: string
  question: string
  purpose: string | null
  sort_order: number
  is_active: boolean
}

const CALL_FLOW_INDUSTRIES = ['towing', 'plumbing', 'electrical', 'cleaning', 'hvac', 'other'] as const

const fieldCls =
  'w-full rounded-[10px] border border-[var(--line-strong)] bg-card-2 px-3 py-[9px] ' +
  'text-[14px] text-text font-sans outline-none transition-colors ' +
  'focus:border-orange focus:shadow-[0_0_0_3px_rgba(238,106,44,.15)]'

export default function CallFlowTab({ adminClientId }: { adminClientId?: string | null }) {
  const [questions, setQuestions] = useState<CallFlowQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftQuestion, setDraftQuestion] = useState('')
  const [draftPurpose, setDraftPurpose] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  const [adding, setAdding] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const [newPurpose, setNewPurpose] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  const [reloadIndustry, setReloadIndustry] = useState<string>('towing')

  const sorted = useMemo(
    () => [...questions].sort((a, b) => a.sort_order - b.sort_order),
    [questions],
  )

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null)
    try {
      const r = await fetch(withAdmin('/api/onboarding/call-flow', adminClientId))
      const d = await r.json().catch(() => ({} as Record<string, unknown>))
      if (!r.ok) { setLoadError(typeof d.error === 'string' ? d.error : 'Could not load your call flow.'); return }
      setQuestions(Array.isArray(d.questions) ? (d.questions as CallFlowQuestion[]) : [])
    } catch (e) {
      setLoadError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [adminClientId])

  useEffect(() => { void load() }, [load])

  function startEdit(q: CallFlowQuestion) {
    setEditingId(q.id); setDraftQuestion(q.question); setDraftPurpose(q.purpose ?? ''); setEditError(null); setAdding(false)
  }

  function cancelEdit() {
    setEditingId(null); setDraftQuestion(''); setDraftPurpose(''); setEditError(null)
  }

  async function saveEdit(id: string) {
    if (!draftQuestion.trim()) { setEditError('Question is required.'); return }
    setBusy(true); setEditError(null)
    try {
      const r = await fetch(withAdmin('/api/onboarding/call-flow', adminClientId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, question: draftQuestion.trim(), purpose: draftPurpose.trim() }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({} as Record<string, unknown>))
        setEditError(typeof d.error === 'string' ? d.error : 'Update failed.')
        return
      }
      setQuestions(prev => prev.map(x => x.id === id ? { ...x, question: draftQuestion.trim(), purpose: draftPurpose.trim() || null } : x))
      cancelEdit()
    } catch (e) {
      setEditError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function addQuestion() {
    if (!newQuestion.trim()) { setAddError('Question is required.'); return }
    setBusy(true); setAddError(null)
    try {
      const r = await fetch(withAdmin('/api/onboarding/call-flow', adminClientId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: newQuestion.trim(), purpose: newPurpose.trim() }),
      })
      const d = await r.json().catch(() => ({} as Record<string, unknown>))
      if (!r.ok || !d.question) { setAddError(typeof d.error === 'string' ? d.error : 'Could not add question.'); return }
      setQuestions(prev => [...prev, d.question as CallFlowQuestion])
      setAdding(false); setNewQuestion(''); setNewPurpose('')
    } catch (e) {
      setAddError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function removeQuestion(id: string) {
    if (!window.confirm('Delete this question?')) return
    setBusy(true)
    try {
      const r = await fetch(withAdmin(`/api/onboarding/call-flow?id=${encodeURIComponent(id)}`, adminClientId), { method: 'DELETE' })
      if (!r.ok) return
      setQuestions(prev => prev.filter(x => x.id !== id))
    } finally {
      setBusy(false)
    }
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = sorted.findIndex(q => q.id === id)
    const swapWith = idx + dir
    if (idx < 0 || swapWith < 0 || swapWith >= sorted.length) return
    const reordered = [...sorted]
    const tmp = reordered[idx]
    reordered[idx] = reordered[swapWith]
    reordered[swapWith] = tmp
    const withOrder = reordered.map((q, i) => ({ ...q, sort_order: i }))
    setQuestions(withOrder)
    setBusy(true)
    try {
      await fetch(withAdmin('/api/onboarding/call-flow', adminClientId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: withOrder.map(q => ({ id: q.id, sort_order: q.sort_order })) }),
      })
    } finally {
      setBusy(false)
    }
  }

  async function reloadDefaults() {
    if (!window.confirm(`This replaces your current questions with the ${reloadIndustry} preset.`)) return
    setBusy(true)
    try {
      const r = await fetch(withAdmin('/api/onboarding/call-flow', adminClientId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reload_defaults', industry: reloadIndustry }),
      })
      const d = await r.json().catch(() => ({} as Record<string, unknown>))
      if (!r.ok) return
      setQuestions(Array.isArray(d.questions) ? (d.questions as CallFlowQuestion[]) : [])
      cancelEdit(); setAdding(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h2 className="text-[16px] font-extrabold tracking-[-.2px] text-text">Opening questions your agent asks every caller</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-dim">
          These are the first questions your agent asks to understand what the caller needs.
        </p>
      </div>

      {/* Controls: reload defaults + (disabled) sync */}
      <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-line bg-card px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold text-dim">Reload defaults</span>
          <select
            value={reloadIndustry}
            onChange={e => setReloadIndustry(e.target.value)}
            disabled={busy}
            className="cursor-pointer rounded-lg border border-[var(--line-strong)] bg-card-2 px-2.5 py-[7px] text-[12px] text-text outline-none"
          >
            {CALL_FLOW_INDUSTRIES.map(ind => (
              <option key={ind} value={ind}>{ind.charAt(0).toUpperCase() + ind.slice(1)}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={reloadDefaults}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-orange/30 bg-orange/10 px-3 py-[7px] text-[12px] font-bold text-orange transition hover:bg-orange/[.16] disabled:opacity-50"
          >
            <RefreshCw size={12} /> Load preset
          </button>
        </div>
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[11px] text-dim">Call Flow goes live in a coming update.</span>
          <ButtonV2 disabled title="Call Flow goes live in a coming update." className="px-3.5 py-[7px] text-[12px] opacity-40">
            <RefreshCw size={12} /> Sync Now
          </ButtonV2>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="rounded-[12px] border border-dashed border-line-strong px-6 py-6 text-center text-[13px] text-dim">
          Loading your call flow…
        </div>
      ) : loadError ? (
        <div className="rounded-[12px] border border-[rgba(240,98,90,.25)] bg-[rgba(240,98,90,.08)] px-4 py-3.5 text-[13px] text-red">
          {loadError}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sorted.length === 0 && !adding && (
            <div className="rounded-[12px] border border-dashed border-line-strong px-6 py-6 text-center text-[13px] text-dim">
              No call flow questions yet. Add one, or load your industry defaults.
            </div>
          )}

          {sorted.map((q, i) => (
            editingId === q.id ? (
              <div key={q.id} className="rounded-[12px] border border-orange/25 bg-orange/[.06] p-4">
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.05em] text-orange">Question</label>
                <input type="text" value={draftQuestion} onChange={e => setDraftQuestion(e.target.value)} className={fieldCls + ' mb-3'} />
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.05em] text-orange">Purpose (optional)</label>
                <input type="text" value={draftPurpose} onChange={e => setDraftPurpose(e.target.value)} placeholder="What this question is for" className={fieldCls} />
                <div className="mt-3 flex items-center gap-2.5">
                  {editError && <span className="text-[12px] text-red">{editError}</span>}
                  <div className="flex-1" />
                  <button type="button" onClick={cancelEdit} className="flex items-center gap-1 px-3 py-2 text-[12px] font-medium text-dim transition hover:text-text">
                    <X size={14} /> Cancel
                  </button>
                  <ButtonV2 onClick={() => saveEdit(q.id)} disabled={busy} className="px-4 py-2 text-[13px]">
                    <Save size={13} /> {busy ? 'Saving…' : 'Save changes'}
                  </ButtonV2>
                </div>
              </div>
            ) : (
              <article key={q.id} className="rounded-[12px] border border-line bg-card px-4 py-3.5">
                <div className="flex items-start gap-2.5">
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => move(q.id, -1)}
                      disabled={busy || i === 0}
                      aria-label="Move up"
                      className="flex items-center rounded-lg border border-line p-[5px] text-dim transition enabled:hover:text-text disabled:opacity-30"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(q.id, 1)}
                      disabled={busy || i === sorted.length - 1}
                      aria-label="Move down"
                      className="flex items-center rounded-lg border border-line p-[5px] text-dim transition enabled:hover:text-text disabled:opacity-30"
                    >
                      <ArrowDown size={13} />
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-text">{q.question}</div>
                    {q.purpose && <div className="mt-1.5 text-[12px] leading-relaxed text-dim">{q.purpose}</div>}
                  </div>
                  <button type="button" onClick={() => startEdit(q)} aria-label="Edit" className="flex items-center rounded-lg border border-line p-2 text-dim transition hover:text-text">
                    <Pencil size={14} />
                  </button>
                  <button type="button" onClick={() => removeQuestion(q.id)} aria-label="Delete" className="flex items-center rounded-lg border border-[rgba(240,98,90,.25)] p-2 text-red transition hover:bg-[rgba(240,98,90,.08)]">
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            )
          ))}

          {adding && (
            <div className="rounded-[12px] border border-orange/25 bg-orange/[.06] p-4">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.05em] text-orange">Question</label>
              <input type="text" value={newQuestion} onChange={e => setNewQuestion(e.target.value)} placeholder="e.g. What is the address of the breakdown?" className={fieldCls + ' mb-3'} />
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.05em] text-orange">Purpose (optional)</label>
              <input type="text" value={newPurpose} onChange={e => setNewPurpose(e.target.value)} placeholder="What this question is for" className={fieldCls} />
              <div className="mt-3 flex items-center gap-2.5">
                {addError && <span className="text-[12px] text-red">{addError}</span>}
                <div className="flex-1" />
                <button type="button" onClick={() => { setAdding(false); setNewQuestion(''); setNewPurpose(''); setAddError(null) }} className="flex items-center gap-1 px-3 py-2 text-[12px] font-medium text-dim transition hover:text-text">
                  <X size={14} /> Cancel
                </button>
                <ButtonV2 onClick={addQuestion} disabled={busy} className="px-4 py-2 text-[13px]">
                  <Save size={13} /> {busy ? 'Saving…' : 'Add question'}
                </ButtonV2>
              </div>
            </div>
          )}

          {!adding && (
            <button
              type="button"
              onClick={() => { setAdding(true); cancelEdit() }}
              className="mt-1 flex items-center justify-center gap-2 rounded-[12px] border border-dashed border-orange/30 bg-orange/[.06] px-4 py-3 text-[13px] font-semibold text-orange transition hover:bg-orange/10"
            >
              <Plus size={15} /> Add question
            </button>
          )}
        </div>
      )}
    </div>
  )
}
