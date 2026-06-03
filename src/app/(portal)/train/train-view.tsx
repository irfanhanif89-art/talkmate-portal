'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  Sparkles, Plus, Pencil, Trash2, Save, X,
  RefreshCw, CheckCircle2, AlertCircle, Clock,
  Bot, User,
} from 'lucide-react'
import { UnderlineTabs } from '@/components/portal/ui-v2/tabs'
import { ButtonV2 } from '@/components/portal/ui-v2/button'
import { Panel, PanelHeader } from '@/components/portal/ui-v2/panel'

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'error'

export type CategoryKey = 'faq' | 'service' | 'hours' | 'pricing' | 'team' | 'custom'

export interface KbEntryDTO {
  id: string
  category: CategoryKey
  question: string
  answer: string
  sortOrder: number
  updatedAt: string
}

interface Props {
  businessName: string
  hasVapiAgent: boolean
  initialEntries: KbEntryDTO[]
  initialSyncStatus: SyncStatus
  initialLastSyncedAt: string | null
  /** When set, all API calls go to /api/knowledge-base?adminClientId=… */
  adminClientId?: string | null
}

function withAdmin(path: string, adminClientId: string | null | undefined): string {
  if (!adminClientId) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}adminClientId=${encodeURIComponent(adminClientId)}`
}

interface TabConfig {
  key: CategoryKey
  label: string
  questionLabel: string
  answerLabel: string
  emptyHint: string
}

const TABS: TabConfig[] = [
  { key: 'faq',     label: 'FAQs',           questionLabel: 'Customer question', answerLabel: 'Your answer',               emptyHint: 'No FAQs added yet. Add your first one so TalkMate knows what to say.' },
  { key: 'service', label: 'Services',       questionLabel: 'Service name',      answerLabel: 'Description and pricing',   emptyHint: 'No services added yet. Add your first one so TalkMate knows what you offer.' },
  { key: 'hours',   label: 'Business Hours', questionLabel: 'Day or period',     answerLabel: 'Hours (e.g. Mon-Fri 8am-6pm)', emptyHint: 'No business hours added yet. Add your standard opening times.' },
  { key: 'pricing', label: 'Pricing',        questionLabel: 'Service or item',   answerLabel: 'Price and details',         emptyHint: 'No pricing added yet. Add the prices TalkMate should quote.' },
  { key: 'team',    label: 'Team',           questionLabel: 'Team member name',  answerLabel: 'Role and what they handle', emptyHint: 'No team members added yet. Add the people TalkMate can route calls to.' },
  { key: 'custom',  label: 'Custom',         questionLabel: 'Topic',             answerLabel: 'Information',               emptyHint: 'No custom information added yet. Add anything else TalkMate should know.' },
]

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

// ─── Preview messages ────────────────────────────────────────────────────────
// Static illustrative conversation; agent name reflects real businessName.
function PreviewChat({ businessName }: { businessName: string }) {
  const agentLabel = 'TalkMate'
  const messages = [
    { role: 'agent', text: `Good morning, ${businessName} — thanks for calling. How can I help you today?` },
    { role: 'caller', text: 'Hi, do you have availability this week?' },
    { role: 'agent', text: 'Absolutely! I can check that for you. Could I grab your name and what service you need?' },
    { role: 'caller', text: 'It\'s Sarah, and I need a quote for the premium package.' },
    { role: 'agent', text: 'Perfect, Sarah. I\'ll pass that through and someone will be in touch within the hour. Is that OK?' },
    { role: 'caller', text: 'That\'s great, thank you!' },
    { role: 'agent', text: 'You\'re welcome! We\'ll speak soon. Have a wonderful day.' },
  ]
  return (
    <div className="flex flex-col gap-3">
      {messages.map((m, i) => (
        <div
          key={i}
          className={
            m.role === 'agent'
              ? 'max-w-[88%] mr-auto'
              : 'max-w-[88%] ml-auto'
          }
        >
          <div
            className={
              m.role === 'agent'
                ? 'rounded-[13px] rounded-bl-[4px] px-3.5 py-2.5 text-[13px] leading-relaxed border bg-[rgba(238,106,44,.12)] border-[rgba(238,106,44,.2)] text-text'
                : 'rounded-[13px] rounded-br-[4px] px-3.5 py-2.5 text-[13px] leading-relaxed border bg-card-2 border-line text-dim'
            }
          >
            <span className={`block mb-0.5 text-[10px] font-bold tracking-widest uppercase opacity-70 ${m.role === 'agent' ? 'text-orange' : 'text-dim'}`}>
              {m.role === 'agent' ? agentLabel : 'Caller'}
            </span>
            {m.text}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Sync status bar ─────────────────────────────────────────────────────────
function SyncBar({
  syncStatus,
  lastSyncedAt,
  hasVapiAgent,
  syncing,
  syncFlash,
  onSync,
}: {
  syncStatus: SyncStatus
  lastSyncedAt: string | null
  hasVapiAgent: boolean
  syncing: boolean
  syncFlash: 'success' | 'error' | null
  onSync: () => void
}) {
  const isPending = syncStatus === 'pending'
  const isError = syncStatus === 'error'
  const isSyncing = syncStatus === 'syncing'

  return (
    <div
      className={[
        'flex items-center gap-3 rounded-xl px-4 py-3 border text-[13px] mb-4',
        isPending  ? 'bg-[rgba(251,191,36,.07)] border-[rgba(251,191,36,.22)]' : '',
        isError    ? 'bg-[rgba(239,68,68,.07)]  border-[rgba(239,68,68,.22)]'  : '',
        isSyncing  ? 'bg-card border-line'                                       : '',
        (!isPending && !isError && !isSyncing) ? 'bg-card border-line'          : '',
      ].join(' ')}
    >
      {isSyncing  && <Clock         size={15} className="text-dim flex-shrink-0" />}
      {isPending  && <AlertCircle   size={15} className="text-[#FBBF24] flex-shrink-0" />}
      {isError    && <AlertCircle   size={15} className="text-red flex-shrink-0" />}
      {!isSyncing && !isPending && !isError && <CheckCircle2 size={15} className="text-green flex-shrink-0" />}

      <div className="flex-1 min-w-0">
        {isSyncing && <span className="text-dim">Syncing your changes to TalkMate…</span>}
        {isPending && <span className="text-[#FBBF24]">Unsaved changes — sync now to update your agent.</span>}
        {isError   && <span className="text-red">Sync failed. Try again.</span>}
        {!isSyncing && !isPending && !isError && (
          <span className="text-dim">
            Last synced {fmtSyncedAgo(lastSyncedAt)}
            {!hasVapiAgent && <span className="text-faint ml-2">(agent not configured yet)</span>}
          </span>
        )}
        {syncFlash === 'success' && <span className="text-green ml-3">Synced just now</span>}
        {syncFlash === 'error'   && <span className="text-red   ml-3">Sync failed — try again</span>}
      </div>

      <ButtonV2
        variant="primary"
        onClick={onSync}
        disabled={syncing || isSyncing}
        className="flex-shrink-0 gap-1.5 px-3 py-1.5 text-[12px]"
      >
        <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
        {syncing ? 'Syncing…' : 'Sync Now'}
      </ButtonV2>
    </div>
  )
}

// ─── Entry editor card ────────────────────────────────────────────────────────
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
    <div className="rounded-xl border border-[rgba(238,106,44,.28)] bg-[rgba(238,106,44,.06)] p-4">
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.05em] text-orange">
        {props.titleLabel}
      </label>
      <input
        type="text"
        value={props.question}
        onChange={e => props.onQuestionChange(e.target.value)}
        maxLength={200}
        className="mb-3 w-full rounded-lg border border-line bg-[rgba(255,255,255,.04)] px-3 py-2 text-[14px] text-text outline-none focus:border-[rgba(238,106,44,.5)] transition"
        style={{ fontFamily: 'inherit' }}
      />
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.05em] text-orange">
        {props.answerLabel}
      </label>
      <textarea
        value={props.answer}
        onChange={e => props.onAnswerChange(e.target.value)}
        rows={4}
        maxLength={2000}
        className="w-full resize-y rounded-lg border border-line bg-[rgba(255,255,255,.04)] px-3 py-2 text-[14px] text-text outline-none focus:border-[rgba(238,106,44,.5)] transition"
        style={{ fontFamily: 'inherit' }}
      />
      <div className="mt-3 flex items-center gap-2.5">
        {props.error && (
          <span className="text-[12px] text-red">{props.error}</span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={props.onCancel}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-[12px] font-medium text-dim hover:text-text transition"
        >
          <X size={13} /> Cancel
        </button>
        <ButtonV2
          variant="primary"
          onClick={props.onSave}
          disabled={props.busy}
          className="gap-1.5 px-3.5 py-2 text-[13px]"
        >
          <Save size={13} />
          {props.busy ? 'Saving…' : props.saveLabel}
        </ButtonV2>
      </div>
    </div>
  )
}

// ─── Entry row ────────────────────────────────────────────────────────────────
function EntryRow({
  entry,
  onEdit,
  onDelete,
  busy,
}: {
  entry: KbEntryDTO
  onEdit: () => void
  onDelete: () => void
  busy: boolean
}) {
  return (
    <article className="flex items-start gap-3 rounded-xl border border-line bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,.28)]">
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-text">{entry.question}</div>
        <div
          className="mt-1.5 text-[13px] leading-relaxed text-dim overflow-hidden"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
          }}
        >
          {entry.answer}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={onEdit}
          disabled={busy}
          aria-label="Edit"
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-line bg-card text-dim hover:text-text transition disabled:opacity-40"
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label="Delete"
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-[rgba(239,68,68,.22)] bg-card text-red hover:bg-[rgba(239,68,68,.08)] transition disabled:opacity-40"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </article>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────
export default function TrainView(props: Props) {
  const [entries, setEntries] = useState<KbEntryDTO[]>(props.initialEntries)
  const [activeTab, setActiveTab] = useState<CategoryKey>('faq')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(props.initialSyncStatus)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(props.initialLastSyncedAt)
  const [syncing, setSyncing] = useState(false)
  const [syncFlash, setSyncFlash] = useState<'success' | 'error' | null>(null)

  // Editor state
  const [addingFor, setAddingFor] = useState<CategoryKey | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftQuestion, setDraftQuestion] = useState('')
  const [draftAnswer, setDraftAnswer] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const entriesForTab = useMemo(
    () => entries
      .filter(e => e.category === activeTab)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    [entries, activeTab],
  )

  const config = TABS.find(t => t.key === activeTab)!

  const startAdd = useCallback((cat: CategoryKey) => {
    setAddingFor(cat)
    setEditingId(null)
    setDraftQuestion('')
    setDraftAnswer('')
    setFormError(null)
  }, [])

  const startEdit = useCallback((entry: KbEntryDTO) => {
    setEditingId(entry.id)
    setAddingFor(null)
    setDraftQuestion(entry.question)
    setDraftAnswer(entry.answer)
    setFormError(null)
  }, [])

  const cancelForm = useCallback(() => {
    setEditingId(null)
    setAddingFor(null)
    setDraftQuestion('')
    setDraftAnswer('')
    setFormError(null)
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
    setBusy(true)
    setFormError(null)
    try {
      const r = await fetch(withAdmin('/api/knowledge-base', props.adminClientId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: addingFor,
          question: draftQuestion.trim(),
          answer: draftAnswer.trim(),
        }),
      })
      const d = await r.json().catch(() => ({} as Record<string, unknown>))
      if (!r.ok || !d.entry) {
        setFormError(typeof d.error === 'string' ? d.error : 'Save failed')
        return
      }
      const e = d.entry as {
        id: string; category: CategoryKey; question: string
        answer: string; sort_order: number; updated_at: string
      }
      setEntries(prev => [...prev, {
        id: e.id, category: e.category, question: e.question,
        answer: e.answer, sortOrder: e.sort_order, updatedAt: e.updated_at,
      }])
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
    setBusy(true)
    setFormError(null)
    try {
      const r = await fetch(withAdmin(`/api/knowledge-base/${id}`, props.adminClientId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: draftQuestion.trim(),
          answer: draftAnswer.trim(),
        }),
      })
      const d = await r.json().catch(() => ({} as Record<string, unknown>))
      if (!r.ok || !d.entry) {
        setFormError(typeof d.error === 'string' ? d.error : 'Update failed')
        return
      }
      const e = d.entry as {
        id: string; category: CategoryKey; question: string
        answer: string; sort_order: number; updated_at: string
      }
      setEntries(prev => prev.map(x => x.id === id ? {
        id: e.id, category: e.category, question: e.question,
        answer: e.answer, sortOrder: e.sort_order, updatedAt: e.updated_at,
      } : x))
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
    setSyncing(true)
    setSyncStatus('syncing')
    setSyncFlash(null)
    try {
      const r = await fetch(withAdmin('/api/knowledge-base/sync', props.adminClientId), { method: 'POST' })
      const d = await r.json().catch(() => ({} as Record<string, unknown>))
      if (!r.ok) {
        setSyncStatus('error')
        setSyncFlash('error')
        return
      }
      setSyncStatus('synced')
      setLastSyncedAt(new Date().toISOString())
      setSyncFlash('success')
      setTimeout(() => setSyncFlash(null), 3000)
      void d
    } catch {
      setSyncStatus('error')
      setSyncFlash('error')
    } finally {
      setSyncing(false)
    }
  }

  // Count badge for tabs
  const tabDefs = TABS.map(t => ({
    value: t.key,
    label: `${t.label}${entries.filter(e => e.category === t.key).length > 0 ? ` (${entries.filter(e => e.category === t.key).length})` : ''}`,
  }))

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center gap-3.5 px-8 pt-7 pb-5 border-b border-line flex-shrink-0">
        <div className="w-11 h-11 rounded-xl bg-[rgba(238,106,44,.12)] flex items-center justify-center flex-shrink-0">
          <Sparkles size={21} className="text-orange" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] font-extrabold tracking-[-0.4px] text-text leading-tight">AI Receptionist</h1>
          <p className="text-[13px] text-dim mt-0.5">
            Teach TalkMate about your business so it answers every question perfectly.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(46,201,138,.3)] bg-green-soft px-3.5 py-1.5 text-[12.5px] font-bold text-green">
            <span className="w-1.5 h-1.5 rounded-full bg-green inline-block" />
            {props.hasVapiAgent ? 'Live · Agent ready' : 'Agent not configured'}
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-8 flex-shrink-0">
        <UnderlineTabs
          tabs={tabDefs}
          value={activeTab}
          onChange={(v) => { setActiveTab(v as CategoryKey); cancelForm() }}
        />
      </div>

      {/* 2-col content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* LEFT — KB editor */}
        <div className="flex-1 min-w-0 overflow-y-auto px-8 py-6 border-r border-line" style={{ scrollbarWidth: 'none' }}>
          {/* Sync status bar */}
          <SyncBar
            syncStatus={syncStatus}
            lastSyncedAt={lastSyncedAt}
            hasVapiAgent={props.hasVapiAgent}
            syncing={syncing}
            syncFlash={syncFlash}
            onSync={syncNow}
          />

          {/* Section label */}
          <div className="mb-4">
            <h2 className="text-[15px] font-bold text-text tracking-[-0.2px]">{config.label}</h2>
            <p className="text-[13px] text-dim mt-1">{config.emptyHint}</p>
          </div>

          {/* Entries */}
          <div className="flex flex-col gap-2.5">
            {entriesForTab.length === 0 && addingFor !== activeTab && (
              <div className="rounded-xl border border-dashed border-line bg-card py-8 text-center">
                <Bot size={28} className="text-faint mx-auto mb-2" />
                <p className="text-[13px] text-dim">{config.emptyHint}</p>
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
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  onEdit={() => startEdit(entry)}
                  onDelete={() => remove(entry.id)}
                  busy={busy}
                />
              )
            ))}

            {addingFor === activeTab && (
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

            {addingFor !== activeTab && (
              <button
                type="button"
                onClick={() => startAdd(activeTab)}
                className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[rgba(238,106,44,.3)] bg-[rgba(238,106,44,.05)] py-3 text-[13px] font-semibold text-orange hover:bg-[rgba(238,106,44,.09)] transition mt-1"
              >
                <Plus size={15} />
                Add {config.label.replace(/s$/, '').toLowerCase()}
              </button>
            )}
          </div>
        </div>

        {/* RIGHT — Live preview panel */}
        <div
          className="w-[380px] flex-shrink-0 flex flex-col overflow-hidden bg-[var(--sidebar,#040c17)]"
          style={{ background: 'rgba(4,12,23,1)' }}
        >
          <div className="px-6 pt-5 pb-4 border-b border-line flex-shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <Bot size={15} className="text-orange" />
              <h3 className="text-[15px] font-bold text-text">Live preview</h3>
            </div>
            <p className="text-[12.5px] text-dim">
              How TalkMate sounds with your knowledge base
            </p>
          </div>

          <div
            className="flex-1 overflow-y-auto px-6 py-5"
            style={{ scrollbarWidth: 'none' }}
          >
            <PreviewChat businessName={props.businessName} />
          </div>

          <div className="px-6 py-4 border-t border-line flex-shrink-0">
            <p className="text-[12px] text-faint leading-relaxed">
              Add entries on the left, then{' '}
              <span className="font-bold text-orange">Sync Now</span>
              {' '}to push them to your live agent.
            </p>

            {/* Total entries summary */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {TABS.map(t => {
                const count = entries.filter(e => e.category === t.key).length
                if (count === 0) return null
                return (
                  <span
                    key={t.key}
                    className="inline-flex items-center gap-1 rounded-md bg-card border border-line px-2 py-1 text-[11px] font-semibold text-dim"
                  >
                    <span className="font-bold text-text">{count}</span>
                    {' '}{t.label}
                  </span>
                )
              })}
              {entries.length === 0 && (
                <span className="text-[12px] text-faint">No entries yet — add your first above.</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
