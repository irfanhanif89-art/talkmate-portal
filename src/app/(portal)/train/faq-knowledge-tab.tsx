'use client'

// FAQ Knowledge tab — the self-service knowledge-base editor.
// Logic ported verbatim from the original train-view (entries CRUD + sync +
// category sub-tabs); only the styling moved to design-system tokens so it
// adapts to dark/light. Wired to knowledge_base_entries via /api/knowledge-base*.

import { useCallback, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Save, X, RefreshCw, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { FilterTabs } from '@/components/portal/ui-v2/tabs'
import { ButtonV2 } from '@/components/portal/ui-v2/button'
import IndustryTemplateCard from './industry-template-card'
import { withAdmin, type CategoryKey, type KbEntryDTO, type SyncStatus } from './types'

interface TabConfig {
  key: CategoryKey
  label: string
  questionLabel: string
  answerLabel: string
  emptyHint: string
}

const TABS: TabConfig[] = [
  { key: 'faq',     label: 'FAQs',           questionLabel: 'Customer question', answerLabel: 'Your answer',         emptyHint: 'No FAQs added yet. Add your first one so TalkMate knows what to say.' },
  { key: 'service', label: 'Services',       questionLabel: 'Service name',      answerLabel: 'Description and pricing', emptyHint: 'No services added yet. Add your first one so TalkMate knows what you offer.' },
  { key: 'hours',   label: 'Business Hours', questionLabel: 'Day or period',     answerLabel: 'Hours (e.g. Mon-Fri 8am-6pm)', emptyHint: 'No business hours added yet. Add your standard opening times.' },
  { key: 'pricing', label: 'Pricing',        questionLabel: 'Service or item',   answerLabel: 'Price and details',   emptyHint: 'No pricing added yet. Add the prices TalkMate should quote.' },
  { key: 'team',    label: 'Team',           questionLabel: 'Team member name',  answerLabel: 'Role and what they handle', emptyHint: 'No team members added yet. Add the people TalkMate can route calls to.' },
  { key: 'custom',  label: 'Custom',         questionLabel: 'Topic',             answerLabel: 'Information',         emptyHint: 'No custom information added yet. Add anything else TalkMate should know.' },
]

const fieldCls =
  'w-full rounded-[10px] border border-[var(--line-strong)] bg-card-2 px-3 py-[9px] ' +
  'text-[14px] text-text font-sans outline-none transition-colors ' +
  'focus:border-orange focus:shadow-[0_0_0_3px_rgba(238,106,44,.15)]'

function fmtSyncedAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (!Number.isFinite(secs)) return 'Never'
  if (secs < 60) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

interface Props {
  hasVapiAgent: boolean
  initialEntries: KbEntryDTO[]
  initialSyncStatus: SyncStatus
  initialLastSyncedAt: string | null
  adminClientId?: string | null
}

export default function FaqKnowledgeTab(props: Props) {
  const [entries, setEntries] = useState<KbEntryDTO[]>(props.initialEntries)
  const [activeCat, setActiveCat] = useState<CategoryKey>('faq')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(props.initialSyncStatus)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(props.initialLastSyncedAt)
  const [syncing, setSyncing] = useState(false)
  const [syncFlash, setSyncFlash] = useState<'success' | 'error' | null>(null)

  const [addingFor, setAddingFor] = useState<CategoryKey | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftQuestion, setDraftQuestion] = useState('')
  const [draftAnswer, setDraftAnswer] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const entriesForTab = useMemo(
    () => entries
      .filter(e => e.category === activeCat)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    [entries, activeCat],
  )

  const config = TABS.find(t => t.key === activeCat)!

  const startAdd = useCallback((cat: CategoryKey) => {
    setAddingFor(cat); setEditingId(null); setDraftQuestion(''); setDraftAnswer(''); setFormError(null)
  }, [])

  const startEdit = useCallback((entry: KbEntryDTO) => {
    setEditingId(entry.id); setAddingFor(null); setDraftQuestion(entry.question); setDraftAnswer(entry.answer); setFormError(null)
  }, [])

  const cancelForm = useCallback(() => {
    setEditingId(null); setAddingFor(null); setDraftQuestion(''); setDraftAnswer(''); setFormError(null)
  }, [])

  function validate(): string | null {
    const q = draftQuestion.trim()
    const a = draftAnswer.trim()
    if (!q) return 'Question is required.'
    if (q.length > 200) return 'Question is too long (200 char max).'
    if (a.length < 10) return 'Answer must be at least 10 characters.'
    if (a.length > 2000) return 'Answer is too long (2000 char max).'
    return null
  }

  async function saveNew() {
    const err = validate()
    if (err) { setFormError(err); return }
    setBusy(true); setFormError(null)
    try {
      const r = await fetch(withAdmin('/api/knowledge-base', props.adminClientId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: addingFor, question: draftQuestion.trim(), answer: draftAnswer.trim() }),
      })
      const d = await r.json().catch(() => ({} as Record<string, unknown>))
      if (!r.ok || !d.entry) { setFormError(typeof d.error === 'string' ? d.error : 'Save failed'); return }
      const e = d.entry as { id: string; category: CategoryKey; question: string; answer: string; sort_order: number; updated_at: string }
      setEntries(prev => [...prev, { id: e.id, category: e.category, question: e.question, answer: e.answer, sortOrder: e.sort_order, updatedAt: e.updated_at }])
      setSyncStatus('pending')
      cancelForm()
    } catch (e) {
      setFormError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(id: string) {
    const err = validate()
    if (err) { setFormError(err); return }
    setBusy(true); setFormError(null)
    try {
      const r = await fetch(withAdmin(`/api/knowledge-base/${id}`, props.adminClientId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: draftQuestion.trim(), answer: draftAnswer.trim() }),
      })
      const d = await r.json().catch(() => ({} as Record<string, unknown>))
      if (!r.ok || !d.entry) { setFormError(typeof d.error === 'string' ? d.error : 'Update failed'); return }
      const e = d.entry as { id: string; category: CategoryKey; question: string; answer: string; sort_order: number; updated_at: string }
      setEntries(prev => prev.map(x => x.id === id ? { id: e.id, category: e.category, question: e.question, answer: e.answer, sortOrder: e.sort_order, updatedAt: e.updated_at } : x))
      setSyncStatus('pending')
      cancelForm()
    } catch (e) {
      setFormError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this entry?')) return
    setBusy(true)
    try {
      const r = await fetch(withAdmin(`/api/knowledge-base/${id}`, props.adminClientId), { method: 'DELETE' })
      if (!r.ok) return
      setEntries(prev => prev.filter(x => x.id !== id))
      setSyncStatus('pending')
    } finally {
      setBusy(false)
    }
  }

  async function syncNow() {
    if (syncing) return
    setSyncing(true); setSyncStatus('syncing'); setSyncFlash(null)
    try {
      const r = await fetch(withAdmin('/api/knowledge-base/sync', props.adminClientId), { method: 'POST' })
      const d = await r.json().catch(() => ({} as Record<string, unknown>))
      if (!r.ok) { setSyncStatus('error'); setSyncFlash('error'); return }
      setSyncStatus('synced')
      setLastSyncedAt(new Date().toISOString())
      setSyncFlash('success')
      setTimeout(() => setSyncFlash(null), 3000)
      void d
    } catch {
      setSyncStatus('error'); setSyncFlash('error')
    } finally {
      setSyncing(false)
    }
  }

  // Sync-bar accent (accent tokens are theme-invariant, safe on both themes).
  const barTint =
    syncStatus === 'pending' ? 'bg-[rgba(242,181,60,.08)] border-[rgba(242,181,60,.25)]'
      : syncStatus === 'error' ? 'bg-[rgba(240,98,90,.08)] border-[rgba(240,98,90,.25)]'
        : 'bg-card border-line'

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Industry template card — Session 3A. Shows only when the KB is essentially empty. */}
      {entries.length < 3 && <IndustryTemplateCard adminClientId={props.adminClientId} />}

      {/* Sync status bar */}
      <div className={`flex items-center gap-3.5 rounded-[12px] border px-4 py-3 ${barTint}`}>
        {syncStatus === 'syncing' ? <Clock size={16} className="text-blue shrink-0" /> :
          syncStatus === 'pending' ? <AlertCircle size={16} className="text-gold shrink-0" /> :
            syncStatus === 'error' ? <AlertCircle size={16} className="text-red shrink-0" /> :
              <CheckCircle2 size={16} className="text-green shrink-0" />}
        <div className="flex-1 text-[13px]">
          {syncStatus === 'syncing' && <span className="text-blue">Syncing your changes to TalkMate…</span>}
          {syncStatus === 'pending' && <span className="text-gold">You have unsaved changes. Sync now to update your agent.</span>}
          {syncStatus === 'error' && <span className="text-red">Sync failed. Try again.</span>}
          {syncStatus === 'synced' && (
            <span className="text-dim">
              Last synced {fmtSyncedAgo(lastSyncedAt)}
              {!props.hasVapiAgent && <span className="ml-2 text-faint">(agent not configured yet)</span>}
            </span>
          )}
          {syncFlash === 'success' && <span className="ml-3 text-green">Synced just now</span>}
          {syncFlash === 'error' && <span className="ml-3 text-red">Sync failed — try again</span>}
        </div>
        <ButtonV2 onClick={syncNow} disabled={syncing || syncStatus === 'syncing'} className="px-3.5 py-[7px] text-[12px]">
          <RefreshCw size={12} /> {syncing ? 'Syncing…' : 'Sync Now'}
        </ButtonV2>
      </div>

      {/* Category sub-tabs */}
      <div className="overflow-x-auto">
        <FilterTabs
          tabs={TABS.map(t => ({ value: t.key, label: t.label, count: entries.filter(e => e.category === t.key).length }))}
          value={activeCat}
          onChange={(v) => { setActiveCat(v); cancelForm() }}
        />
      </div>

      {/* Entry list */}
      <div className="flex flex-col gap-2.5">
        {entriesForTab.length === 0 && addingFor !== activeCat && (
          <div className="rounded-[12px] border border-dashed border-line-strong px-6 py-6 text-center text-[13px] text-dim">
            {config.emptyHint}
          </div>
        )}

        {entriesForTab.map(entry => (
          editingId === entry.id ? (
            <EditorCard
              key={entry.id}
              titleLabel={config.questionLabel}
              answerLabel={config.answerLabel}
              question={draftQuestion}
              answer={draftAnswer}
              onQuestionChange={setDraftQuestion}
              onAnswerChange={setDraftAnswer}
              onSave={() => saveEdit(entry.id)}
              onCancel={cancelForm}
              busy={busy}
              error={formError}
              saveLabel="Save changes"
            />
          ) : (
            <article key={entry.id} className="rounded-[12px] border border-line bg-card px-4 py-3.5">
              <div className="flex items-start gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-text">{entry.question}</div>
                  <div className="mt-1.5 text-[13px] leading-relaxed text-dim line-clamp-2">{entry.answer}</div>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(entry)}
                  aria-label="Edit"
                  className="flex items-center rounded-lg border border-line p-2 text-dim transition hover:text-text"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(entry.id)}
                  aria-label="Delete"
                  className="flex items-center rounded-lg border border-[rgba(240,98,90,.25)] p-2 text-red transition hover:bg-[rgba(240,98,90,.08)]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          )
        ))}

        {addingFor === activeCat && (
          <EditorCard
            titleLabel={config.questionLabel}
            answerLabel={config.answerLabel}
            question={draftQuestion}
            answer={draftAnswer}
            onQuestionChange={setDraftQuestion}
            onAnswerChange={setDraftAnswer}
            onSave={saveNew}
            onCancel={cancelForm}
            busy={busy}
            error={formError}
            saveLabel="Add entry"
          />
        )}

        {addingFor !== activeCat && (
          <button
            type="button"
            onClick={() => startAdd(activeCat)}
            className="mt-1 flex items-center justify-center gap-2 rounded-[12px] border border-dashed border-orange/30 bg-orange/[.06] px-4 py-3 text-[13px] font-semibold text-orange transition hover:bg-orange/10"
          >
            <Plus size={15} /> Add {config.label.replace(/s$/, '').toLowerCase()}
          </button>
        )}
      </div>
    </div>
  )
}

interface EditorCardProps {
  titleLabel: string
  answerLabel: string
  question: string
  answer: string
  onQuestionChange: (v: string) => void
  onAnswerChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  busy: boolean
  error: string | null
  saveLabel: string
}

function EditorCard(props: EditorCardProps) {
  return (
    <div className="rounded-[12px] border border-orange/25 bg-orange/[.06] p-4">
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.05em] text-orange">{props.titleLabel}</label>
      <input
        type="text"
        value={props.question}
        onChange={e => props.onQuestionChange(e.target.value)}
        maxLength={200}
        className={fieldCls + ' mb-3'}
      />
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.05em] text-orange">{props.answerLabel}</label>
      <textarea
        value={props.answer}
        onChange={e => props.onAnswerChange(e.target.value)}
        rows={4}
        maxLength={2000}
        className={fieldCls + ' resize-y'}
      />
      <div className="mt-3 flex items-center gap-2.5">
        {props.error && <span className="text-[12px] text-red">{props.error}</span>}
        <div className="flex-1" />
        <button
          type="button"
          onClick={props.onCancel}
          className="flex items-center gap-1 px-3 py-2 text-[12px] font-medium text-dim transition hover:text-text"
        >
          <X size={14} /> Cancel
        </button>
        <ButtonV2 onClick={props.onSave} disabled={props.busy} className="px-4 py-2 text-[13px]">
          <Save size={13} /> {props.busy ? 'Saving…' : props.saveLabel}
        </ButtonV2>
      </div>
    </div>
  )
}
