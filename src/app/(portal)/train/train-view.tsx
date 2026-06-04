'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sparkles, Plus, Pencil, Trash2, Save, X, RefreshCw, CheckCircle2, AlertCircle, Clock, ArrowUp, ArrowDown } from 'lucide-react'
import IndustryTemplateCard from './industry-template-card'

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'error'

export type CategoryKey = 'faq' | 'service' | 'hours' | 'pricing' | 'team' | 'custom'

// The Call Flow tab (Session 4A) lives alongside the 6 knowledge-base tabs but
// reads/writes a separate table via /api/onboarding/call-flow.
type TabKey = CategoryKey | 'callflow'

interface CallFlowQuestion {
  id: string
  question: string
  purpose: string | null
  sort_order: number
  is_active: boolean
}

const CALL_FLOW_INDUSTRIES = ['towing', 'plumbing', 'electrical', 'cleaning', 'hvac', 'other'] as const

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
  // When set, all API calls go to /api/knowledge-base?adminClientId=...
  // so admins can edit/sync on behalf of a client.
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
  { key: 'faq',     label: 'FAQs',           questionLabel: 'Customer question', answerLabel: 'Your answer',         emptyHint: 'No FAQs added yet. Add your first one so TalkMate knows what to say.' },
  { key: 'service', label: 'Services',       questionLabel: 'Service name',      answerLabel: 'Description and pricing', emptyHint: 'No services added yet. Add your first one so TalkMate knows what you offer.' },
  { key: 'hours',   label: 'Business Hours', questionLabel: 'Day or period',     answerLabel: 'Hours (e.g. Mon-Fri 8am-6pm)', emptyHint: 'No business hours added yet. Add your standard opening times.' },
  { key: 'pricing', label: 'Pricing',        questionLabel: 'Service or item',   answerLabel: 'Price and details',   emptyHint: 'No pricing added yet. Add the prices TalkMate should quote.' },
  { key: 'team',    label: 'Team',           questionLabel: 'Team member name',  answerLabel: 'Role and what they handle', emptyHint: 'No team members added yet. Add the people TalkMate can route calls to.' },
  { key: 'custom',  label: 'Custom',         questionLabel: 'Topic',             answerLabel: 'Information',         emptyHint: 'No custom information added yet. Add anything else TalkMate should know.' },
]

const ORANGE = '#E8622A'

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

export default function TrainView(props: Props) {
  const [entries, setEntries] = useState<KbEntryDTO[]>(props.initialEntries)
  const [activeTab, setActiveTab] = useState<TabKey>('faq')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(props.initialSyncStatus)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(props.initialLastSyncedAt)
  const [syncing, setSyncing] = useState(false)
  const [syncFlash, setSyncFlash] = useState<'success' | 'error' | null>(null)

  // Editor state — addingFor=category means an inline "add" form for that tab
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

  const config = TABS.find(t => t.key === activeTab)

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
      const e = d.entry as { id: string; category: CategoryKey; question: string; answer: string; sort_order: number; updated_at: string }
      setEntries(prev => [...prev, {
        id: e.id,
        category: e.category,
        question: e.question,
        answer: e.answer,
        sortOrder: e.sort_order,
        updatedAt: e.updated_at,
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
      const e = d.entry as { id: string; category: CategoryKey; question: string; answer: string; sort_order: number; updated_at: string }
      setEntries(prev => prev.map(x => x.id === id ? {
        id: e.id,
        category: e.category,
        question: e.question,
        answer: e.answer,
        sortOrder: e.sort_order,
        updatedAt: e.updated_at,
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

  // ─────────── render ───────────

  return (
    <div style={{
      padding: '28px 32px', maxWidth: 980, margin: '0 auto',
      color: '#F1F5F9', fontFamily: 'Outfit, sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 24 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: 'rgba(232,98,42,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Sparkles size={22} color={ORANGE} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'white', margin: 0 }}>Train TalkMate</h1>
          <p style={{ fontSize: 13, color: '#7BAED4', marginTop: 4, marginBottom: 0, lineHeight: 1.5 }}>
            Teach TalkMate about your business so it answers every question perfectly.
          </p>
        </div>
      </div>

      {/* Industry template card — Session 3A. Shows only when the KB is essentially empty. */}
      {entries.length < 3 && <IndustryTemplateCard adminClientId={props.adminClientId} />}

      {/* Sync status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
        marginBottom: 18, borderRadius: 12,
        background: syncStatus === 'pending' ? 'rgba(251,191,36,0.08)'
          : syncStatus === 'error' ? 'rgba(239,68,68,0.08)'
          : 'rgba(255,255,255,0.04)',
        border: `1px solid ${
          syncStatus === 'pending' ? 'rgba(251,191,36,0.25)'
            : syncStatus === 'error' ? 'rgba(239,68,68,0.25)'
            : 'rgba(255,255,255,0.08)'
        }`,
      }}>
        {syncStatus === 'syncing' ? <Clock size={16} color="#7BAED4" /> :
          syncStatus === 'pending' ? <AlertCircle size={16} color="#FBBF24" /> :
          syncStatus === 'error' ? <AlertCircle size={16} color="#EF4444" /> :
          <CheckCircle2 size={16} color="#22C55E" />}
        <div style={{ flex: 1, fontSize: 13 }}>
          {syncStatus === 'syncing' && <span style={{ color: '#7BAED4' }}>Syncing your changes to TalkMate...</span>}
          {syncStatus === 'pending' && <span style={{ color: '#FBBF24' }}>You have unsaved changes. Sync now to update your agent.</span>}
          {syncStatus === 'error' && <span style={{ color: '#EF4444' }}>Sync failed. Try again.</span>}
          {syncStatus === 'synced' && (
            <span style={{ color: '#C8D8EA' }}>
              Last synced {fmtSyncedAgo(lastSyncedAt)}
              {!props.hasVapiAgent && <span style={{ color: '#7BAED4', marginLeft: 8 }}>(agent not configured yet)</span>}
            </span>
          )}
          {syncFlash === 'success' && <span style={{ color: '#22C55E', marginLeft: 12 }}>Synced just now</span>}
          {syncFlash === 'error' && <span style={{ color: '#EF4444', marginLeft: 12 }}>Sync failed - try again</span>}
        </div>
        <button
          type="button"
          onClick={syncNow}
          disabled={syncing || syncStatus === 'syncing'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8,
            background: ORANGE, color: 'white', border: 'none',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit',
            opacity: syncing || syncStatus === 'syncing' ? 0.5 : 1,
          }}
        >
          <RefreshCw size={12} /> {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)',
        marginBottom: 18, overflowX: 'auto',
      }}>
        {TABS.map(tab => {
          const active = tab.key === activeTab
          const count = entries.filter(e => e.category === tab.key).length
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setActiveTab(tab.key); cancelForm() }}
              style={{
                padding: '10px 16px',
                background: 'transparent', border: 'none',
                color: active ? 'white' : '#7BAED4',
                borderBottom: active ? `2px solid ${ORANGE}` : '2px solid transparent',
                fontSize: 13, fontWeight: active ? 700 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {tab.label}
              {count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px',
                  borderRadius: 99,
                  background: active ? ORANGE : 'rgba(255,255,255,0.08)',
                  color: active ? 'white' : '#7BAED4',
                }}>{count}</span>
              )}
            </button>
          )
        })}
        {/* Call Flow tab (Session 4A) — separate table, rendered after the KB tabs. */}
        <button
          key="callflow"
          type="button"
          onClick={() => { setActiveTab('callflow'); cancelForm() }}
          style={{
            padding: '10px 16px',
            background: 'transparent', border: 'none',
            color: activeTab === 'callflow' ? 'white' : '#7BAED4',
            borderBottom: activeTab === 'callflow' ? `2px solid ${ORANGE}` : '2px solid transparent',
            fontSize: 13, fontWeight: activeTab === 'callflow' ? 700 : 500,
            cursor: 'pointer', fontFamily: 'inherit',
            whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          Call Flow
        </button>
      </div>

      {/* Call Flow tab (Session 4A) — draft-only, separate API. */}
      {activeTab === 'callflow' && (
        <CallFlowTab adminClientId={props.adminClientId} />
      )}

      {/* Entry list (the 6 knowledge-base tabs) */}
      {activeTab !== 'callflow' && config && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entriesForTab.length === 0 && addingFor !== activeTab && (
          <div style={{
            padding: 24, textAlign: 'center',
            border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 12,
            color: '#7BAED4', fontSize: 13,
          }}>
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
            <article
              key={entry.id}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12, padding: '14px 16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>{entry.question}</div>
                  <div style={{
                    fontSize: 13, color: '#7BAED4', marginTop: 6, lineHeight: 1.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                    overflow: 'hidden',
                  }}>
                    {entry.answer}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(entry)}
                  aria-label="Edit"
                  style={{
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#7BAED4', borderRadius: 8, padding: 8,
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                  }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(entry.id)}
                  aria-label="Delete"
                  style={{
                    background: 'transparent', border: '1px solid rgba(239,68,68,0.18)',
                    color: '#EF4444', borderRadius: 8, padding: 8,
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
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
            onClick={() => startAdd(activeTab as CategoryKey)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 16px', marginTop: 4,
              background: 'rgba(232,98,42,0.06)',
              border: '1px dashed rgba(232,98,42,0.3)',
              borderRadius: 12, color: ORANGE,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
              justifyContent: 'center',
            }}
          >
            <Plus size={15} /> Add {config.label.replace(/s$/, '').toLowerCase()}
          </button>
        )}
      </div>
      )}
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
    <div style={{
      background: 'rgba(232,98,42,0.06)',
      border: '1px solid rgba(232,98,42,0.25)',
      borderRadius: 12, padding: 16,
    }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#E8622A', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
        {props.titleLabel}
      </label>
      <input
        type="text"
        value={props.question}
        onChange={e => props.onQuestionChange(e.target.value)}
        maxLength={200}
        style={{
          width: '100%', padding: '9px 12px', borderRadius: 8,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: '#F1F5F9', fontSize: 14, fontFamily: 'inherit',
          marginBottom: 12, outline: 'none', boxSizing: 'border-box',
        }}
      />
      <label style={{ fontSize: 11, fontWeight: 700, color: '#E8622A', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
        {props.answerLabel}
      </label>
      <textarea
        value={props.answer}
        onChange={e => props.onAnswerChange(e.target.value)}
        rows={4}
        maxLength={2000}
        style={{
          width: '100%', padding: '9px 12px', borderRadius: 8,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: '#F1F5F9', fontSize: 14, fontFamily: 'inherit',
          outline: 'none', resize: 'vertical', boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        {props.error && (
          <span style={{ fontSize: 12, color: '#EF4444' }}>{props.error}</span>
        )}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={props.onCancel}
          style={{
            background: 'transparent', border: 'none',
            color: '#7BAED4', fontSize: 12, fontWeight: 500,
            cursor: 'pointer', padding: '8px 12px', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <X size={14} /> Cancel
        </button>
        <button
          type="button"
          onClick={props.onSave}
          disabled={props.busy}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8,
            background: ORANGE, color: 'white', border: 'none',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit',
            opacity: props.busy ? 0.5 : 1,
          }}
        >
          <Save size={13} /> {props.busy ? 'Saving...' : props.saveLabel}
        </button>
      </div>
    </div>
  )
}

// ─────────── Call Flow tab (Session 4A) ───────────
// Opening intake questions the agent asks every caller. Draft-only in Round 1:
// stored via /api/onboarding/call-flow but NOT synced to the live agent yet.

const cfInputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#F1F5F9', fontSize: 14, fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box' as const,
}

const cfIconBtnStyle = {
  background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
  color: '#7BAED4', borderRadius: 8, padding: 8,
  cursor: 'pointer', display: 'flex', alignItems: 'center',
}

function CallFlowTab({ adminClientId }: { adminClientId?: string | null }) {
  const [questions, setQuestions] = useState<CallFlowQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Inline editor for a single question (text + purpose).
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftQuestion, setDraftQuestion] = useState('')
  const [draftPurpose, setDraftPurpose] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  // Add-new inline form.
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
    setLoading(true)
    setLoadError(null)
    try {
      const r = await fetch(withAdmin('/api/onboarding/call-flow', adminClientId))
      const d = await r.json().catch(() => ({} as Record<string, unknown>))
      if (!r.ok) {
        setLoadError(typeof d.error === 'string' ? d.error : 'Could not load your call flow.')
        return
      }
      setQuestions(Array.isArray(d.questions) ? (d.questions as CallFlowQuestion[]) : [])
    } catch (e) {
      setLoadError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [adminClientId])

  useEffect(() => { void load() }, [load])

  function startEdit(q: CallFlowQuestion) {
    setEditingId(q.id)
    setDraftQuestion(q.question)
    setDraftPurpose(q.purpose ?? '')
    setEditError(null)
    setAdding(false)
  }

  function cancelEdit() {
    setEditingId(null)
    setDraftQuestion('')
    setDraftPurpose('')
    setEditError(null)
  }

  async function saveEdit(id: string) {
    if (!draftQuestion.trim()) { setEditError('Question is required.'); return }
    setBusy(true)
    setEditError(null)
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
      setQuestions(prev => prev.map(x => x.id === id
        ? { ...x, question: draftQuestion.trim(), purpose: draftPurpose.trim() || null }
        : x))
      cancelEdit()
    } catch (e) {
      setEditError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function addQuestion() {
    if (!newQuestion.trim()) { setAddError('Question is required.'); return }
    setBusy(true)
    setAddError(null)
    try {
      const r = await fetch(withAdmin('/api/onboarding/call-flow', adminClientId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: newQuestion.trim(), purpose: newPurpose.trim() }),
      })
      const d = await r.json().catch(() => ({} as Record<string, unknown>))
      if (!r.ok || !d.question) {
        setAddError(typeof d.error === 'string' ? d.error : 'Could not add question.')
        return
      }
      setQuestions(prev => [...prev, d.question as CallFlowQuestion])
      setAdding(false)
      setNewQuestion('')
      setNewPurpose('')
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
      cancelEdit()
      setAdding(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: 'white', margin: 0 }}>
          Opening questions your agent asks every caller
        </h2>
        <p style={{ fontSize: 13, color: '#7BAED4', marginTop: 6, marginBottom: 0, lineHeight: 1.5 }}>
          These are the first questions your agent asks to understand what the caller needs.
        </p>
      </div>

      {/* Controls row: reload defaults + disabled sync */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
        padding: '12px 14px', marginBottom: 16, borderRadius: 12,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#4A7FBB', fontWeight: 600 }}>Reload defaults</span>
          <select
            value={reloadIndustry}
            onChange={e => setReloadIndustry(e.target.value)}
            disabled={busy}
            style={{
              padding: '7px 10px', borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#F1F5F9', fontSize: 12, fontFamily: 'inherit',
              outline: 'none', cursor: 'pointer',
            }}
          >
            {CALL_FLOW_INDUSTRIES.map(ind => (
              <option key={ind} value={ind} style={{ background: '#1a2233' }}>
                {ind.charAt(0).toUpperCase() + ind.slice(1)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={reloadDefaults}
            disabled={busy}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 8,
              background: 'rgba(232,98,42,0.1)', color: ORANGE,
              border: '1px solid rgba(232,98,42,0.3)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', opacity: busy ? 0.5 : 1,
            }}
          >
            <RefreshCw size={12} /> Load preset
          </button>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#7BAED4' }}>Call Flow goes live in a coming update.</span>
          <button
            type="button"
            disabled
            title="Call Flow goes live in a coming update."
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8,
              background: ORANGE, color: 'white', border: 'none',
              fontSize: 12, fontWeight: 700, cursor: 'not-allowed',
              fontFamily: 'inherit', opacity: 0.4,
            }}
          >
            <RefreshCw size={12} /> Sync Now
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{
          padding: 24, textAlign: 'center', color: '#7BAED4', fontSize: 13,
          border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 12,
        }}>
          Loading your call flow...
        </div>
      ) : loadError ? (
        <div style={{
          padding: 16, color: '#EF4444', fontSize: 13,
          border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12,
          background: 'rgba(239,68,68,0.08)',
        }}>
          {loadError}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.length === 0 && !adding && (
            <div style={{
              padding: 24, textAlign: 'center',
              border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 12,
              color: '#7BAED4', fontSize: 13,
            }}>
              No call flow questions yet. Add one, or load your industry defaults.
            </div>
          )}

          {sorted.map((q, i) => (
            editingId === q.id ? (
              <div key={q.id} style={{
                background: 'rgba(232,98,42,0.06)',
                border: '1px solid rgba(232,98,42,0.25)',
                borderRadius: 12, padding: 16,
              }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#E8622A', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                  Question
                </label>
                <input
                  type="text"
                  value={draftQuestion}
                  onChange={e => setDraftQuestion(e.target.value)}
                  style={{ ...cfInputStyle, marginBottom: 12 }}
                />
                <label style={{ fontSize: 11, fontWeight: 700, color: '#E8622A', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                  Purpose (optional)
                </label>
                <input
                  type="text"
                  value={draftPurpose}
                  onChange={e => setDraftPurpose(e.target.value)}
                  placeholder="What this question is for"
                  style={cfInputStyle}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                  {editError && <span style={{ fontSize: 12, color: '#EF4444' }}>{editError}</span>}
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={cancelEdit}
                    style={{
                      background: 'transparent', border: 'none',
                      color: '#7BAED4', fontSize: 12, fontWeight: 500,
                      cursor: 'pointer', padding: '8px 12px', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <X size={14} /> Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => saveEdit(q.id)}
                    disabled={busy}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px', borderRadius: 8,
                      background: ORANGE, color: 'white', border: 'none',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'inherit', opacity: busy ? 0.5 : 1,
                    }}
                  >
                    <Save size={13} /> {busy ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </div>
            ) : (
              <article key={q.id} style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12, padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  {/* Reorder arrows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => move(q.id, -1)}
                      disabled={busy || i === 0}
                      aria-label="Move up"
                      style={{ ...cfIconBtnStyle, padding: 5, opacity: i === 0 ? 0.3 : 1, cursor: i === 0 ? 'default' : 'pointer' }}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(q.id, 1)}
                      disabled={busy || i === sorted.length - 1}
                      aria-label="Move down"
                      style={{ ...cfIconBtnStyle, padding: 5, opacity: i === sorted.length - 1 ? 0.3 : 1, cursor: i === sorted.length - 1 ? 'default' : 'pointer' }}
                    >
                      <ArrowDown size={13} />
                    </button>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>{q.question}</div>
                    {q.purpose && (
                      <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 5, lineHeight: 1.5 }}>
                        {q.purpose}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(q)}
                    aria-label="Edit"
                    style={cfIconBtnStyle}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeQuestion(q.id)}
                    aria-label="Delete"
                    style={{
                      background: 'transparent', border: '1px solid rgba(239,68,68,0.18)',
                      color: '#EF4444', borderRadius: 8, padding: 8,
                      cursor: 'pointer', display: 'flex', alignItems: 'center',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            )
          ))}

          {/* Add form */}
          {adding && (
            <div style={{
              background: 'rgba(232,98,42,0.06)',
              border: '1px solid rgba(232,98,42,0.25)',
              borderRadius: 12, padding: 16,
            }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#E8622A', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                Question
              </label>
              <input
                type="text"
                value={newQuestion}
                onChange={e => setNewQuestion(e.target.value)}
                placeholder="e.g. What is the address of the breakdown?"
                style={{ ...cfInputStyle, marginBottom: 12 }}
              />
              <label style={{ fontSize: 11, fontWeight: 700, color: '#E8622A', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                Purpose (optional)
              </label>
              <input
                type="text"
                value={newPurpose}
                onChange={e => setNewPurpose(e.target.value)}
                placeholder="What this question is for"
                style={cfInputStyle}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                {addError && <span style={{ fontSize: 12, color: '#EF4444' }}>{addError}</span>}
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => { setAdding(false); setNewQuestion(''); setNewPurpose(''); setAddError(null) }}
                  style={{
                    background: 'transparent', border: 'none',
                    color: '#7BAED4', fontSize: 12, fontWeight: 500,
                    cursor: 'pointer', padding: '8px 12px', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <X size={14} /> Cancel
                </button>
                <button
                  type="button"
                  onClick={addQuestion}
                  disabled={busy}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', borderRadius: 8,
                    background: ORANGE, color: 'white', border: 'none',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'inherit', opacity: busy ? 0.5 : 1,
                  }}
                >
                  <Save size={13} /> {busy ? 'Saving...' : 'Add question'}
                </button>
              </div>
            </div>
          )}

          {!adding && (
            <button
              type="button"
              onClick={() => { setAdding(true); cancelEdit() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 16px', marginTop: 4,
                background: 'rgba(232,98,42,0.06)',
                border: '1px dashed rgba(232,98,42,0.3)',
                borderRadius: 12, color: ORANGE,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', justifyContent: 'center',
              }}
            >
              <Plus size={15} /> Add question
            </button>
          )}
        </div>
      )}
    </div>
  )
}
