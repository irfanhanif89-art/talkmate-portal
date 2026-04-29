'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronDown, ChevronUp, Plus, X, Save, Trash2, GitMerge, StickyNote } from 'lucide-react'
import ContactMergeModal from '@/components/portal/contact-merge-modal'
import IndustryDataView from '@/components/portal/industry-data-view'
import PipelineStageWidget, { type PipelineStage, type PipelineRow } from '@/components/portal/pipeline-stage-widget'

interface Contact {
  id: string
  client_id: string
  name: string | null
  phone: string
  email: string | null
  notes: string | null
  tags: string[] | null
  industry_data: Record<string, unknown>
  first_seen: string
  last_seen: string
  call_count: number
}

interface CallRow {
  id: string
  call_id: string
  call_at: string
  duration_seconds: number | null
  outcome: string | null
  summary: string | null
  transcript: string | null
  tags_applied: string[] | null
}

const STANDARD_TAGS = [
  'new_caller', 'repeat_caller', 'complaint', 'price_enquiry', 'booking', 'order',
  'delivery', 'urgent', 'vip_potential', 'upsell_accepted', 'upsell_declined', 'after_hours',
]

function formatPhone(phone: string): string {
  const m = phone.match(/^\+61(\d{3})(\d{3})(\d{3})$/)
  if (m) return `+61 ${m[1]} ${m[2]} ${m[3]}`
  return phone
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}

function fmtDuration(s: number | null): string {
  if (!s) return '—'
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
}

export default function ContactDetailClient({ contact: initial, calls, industry, pipelineStages = [], pipelineRow = null }: {
  contact: Contact
  calls: CallRow[]
  industry: string | null
  pipelineStages?: PipelineStage[]
  pipelineRow?: PipelineRow | null
}) {
  const router = useRouter()
  const [contact, setContact] = useState<Contact>(initial)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(contact.name ?? '')
  const [email, setEmail] = useState(contact.email ?? '')
  const [notes, setNotes] = useState(contact.notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  const [customTag, setCustomTag] = useState('')
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null)

  async function patch(updates: Partial<Contact>) {
    const res = await fetch(`/api/contacts/${contact.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) return
    const data = await res.json()
    if (data.contact) setContact(data.contact)
  }

  async function saveProfile() {
    await patch({ name, email })
    setEditing(false)
  }

  async function saveNotes() {
    setSavingNotes(true)
    await patch({ notes })
    setSavingNotes(false)
  }

  async function addTag(t: string) {
    const trimmed = t.trim().toLowerCase().replace(/\s+/g, '_')
    if (!trimmed) return
    if ((contact.tags ?? []).includes(trimmed)) return
    const next = [...(contact.tags ?? []), trimmed]
    setContact(c => ({ ...c, tags: next }))
    await patch({ tags: next })
    setCustomTag('')
    setShowTagDropdown(false)
  }

  async function removeTag(t: string) {
    const next = (contact.tags ?? []).filter(x => x !== t)
    setContact(c => ({ ...c, tags: next }))
    await patch({ tags: next })
  }

  async function deleteContact() {
    if (!confirm('Delete this contact and its call history? This cannot be undone.')) return
    const res = await fetch(`/api/contacts/${contact.id}`, { method: 'DELETE' })
    if (res.ok) router.push('/contacts')
  }

  return (
    <div style={{ padding: 28, color: '#F2F6FB' }}>
      <Link href="/contacts" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#7BAED4', textDecoration: 'none', marginBottom: 18 }}>
        <ArrowLeft size={14} /> All contacts
      </Link>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 1fr)', gap: 20 }} className="cd-grid">
        <style>{`@media (max-width: 900px) { .cd-grid { grid-template-columns: 1fr !important; } }`}</style>

        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24 }}>
            {editing ? (
              <div>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" style={detailInput} />
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (optional)" style={{ ...detailInput, marginTop: 10 }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={saveProfile} style={primaryBtn}><Save size={13} /> Save</button>
                  <button onClick={() => { setEditing(false); setName(contact.name ?? ''); setEmail(contact.email ?? '') }} style={ghostBtn}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <h1 style={{ fontSize: 28, fontWeight: 800, color: 'white', marginBottom: 4 }}>
                  {contact.name || <span style={{ color: '#7BAED4' }}>Unknown caller</span>}
                </h1>
                <div style={{ fontSize: 14, color: '#7BAED4' }}>{formatPhone(contact.phone)}{contact.email && ` · ${contact.email}`}</div>
                <div style={{ fontSize: 12, color: '#4A7FBB', marginTop: 6 }}>
                  First seen {fmtDate(contact.first_seen)} · {contact.call_count} call{contact.call_count === 1 ? '' : 's'}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => setEditing(true)} style={ghostBtn}>Edit</button>
                  <button onClick={deleteContact} style={{ ...ghostBtn, color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)' }}><Trash2 size={13} /> Delete</button>
                </div>
              </>
            )}
          </div>

          {/* Tags */}
          <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 22 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Tags</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {(contact.tags ?? []).length === 0 && <span style={{ fontSize: 12, color: '#7BAED4' }}>No tags yet</span>}
              {(contact.tags ?? []).map(t => (
                <span key={t} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 99,
                  background: 'rgba(74,159,232,0.12)', color: '#4A9FE8', textTransform: 'capitalize' as const,
                }}>
                  {t.replace(/_/g, ' ')}
                  <button onClick={() => removeTag(t)} aria-label="Remove" style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', padding: 0 }}>
                    <X size={11} />
                  </button>
                </span>
              ))}
              <button onClick={() => setShowTagDropdown(s => !s)} style={{ ...ghostBtn, padding: '5px 10px', fontSize: 11, fontWeight: 600 }}><Plus size={11} /> Add tag</button>
            </div>
            {showTagDropdown && (
              <div style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {STANDARD_TAGS.filter(t => !(contact.tags ?? []).includes(t)).map(t => (
                    <button key={t} onClick={() => addTag(t)} style={{ ...ghostBtn, padding: '5px 9px', fontSize: 11 }}>{t.replace(/_/g, ' ')}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={customTag} onChange={e => setCustomTag(e.target.value)} placeholder="custom tag" style={{ ...detailInput, flex: 1, padding: '8px 10px', fontSize: 13 }} />
                  <button onClick={() => addTag(customTag)} style={{ ...primaryBtn, padding: '8px 14px', fontSize: 12 }}>Add</button>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notes</div>
              {savingNotes && <span style={{ fontSize: 11, color: '#22C55E' }}>Saving…</span>}
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Notes about this contact (auto-saves)…"
              rows={5}
              style={{ ...detailInput, resize: 'vertical' as const }}
            />
          </div>

          {/* Pipeline stage widget (Session 2 brief Part 7) */}
          {pipelineStages.length > 0 && (
            <PipelineStageWidget contactId={contact.id} stages={pipelineStages} current={pipelineRow} />
          )}

          {/* Industry-specific fields — structured display per industry */}
          {industry && Object.keys(contact.industry_data ?? {}).length > 0 && (
            <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 22 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                {industry.replace(/_/g, ' ')} details
              </div>
              <IndustryDataView industry={industry} data={contact.industry_data} />
            </div>
          )}

          {/* Merge button (Session 2 brief Part 3) */}
          <button onClick={() => setMergeOpen(true)} style={{ ...ghostBtn, justifyContent: 'center', padding: '12px 16px' }}>
            <GitMerge size={14} /> Merge with another contact
          </button>

          <ContactMergeModal
            open={mergeOpen}
            currentContact={{ id: contact.id, name: contact.name, phone: contact.phone, call_count: contact.call_count, last_seen: contact.last_seen, tags: contact.tags }}
            onClose={() => setMergeOpen(false)}
            onMerged={() => { setMergeOpen(false); router.push('/contacts'); router.refresh() }}
          />
        </div>

        {/* RIGHT */}
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Call history</div>
          {calls.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 28, fontSize: 13, color: '#7BAED4' }}>No calls logged yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {calls.map(c => (
                <div key={c.id} style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, overflow: 'hidden' }}>
                  <button
                    onClick={() => setExpandedCallId(expandedCallId === c.id ? null : c.id)}
                    style={{ width: '100%', textAlign: 'left', padding: '12px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{fmtDate(c.call_at)}</span>
                      <span style={{ fontSize: 11, color: '#7BAED4' }}>{fmtDuration(c.duration_seconds)}</span>
                      {expandedCallId === c.id ? <ChevronUp size={14} color="#4A7FBB" /> : <ChevronDown size={14} color="#4A7FBB" />}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                      {c.outcome && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(34,197,94,0.12)', color: '#22C55E', textTransform: 'capitalize' as const }}>
                          {c.outcome.replace(/_/g, ' ')}
                        </span>
                      )}
                      {(c.tags_applied ?? []).slice(0, 4).map(t => (
                        <span key={t} style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(74,159,232,0.12)', color: '#4A9FE8', textTransform: 'capitalize' as const }}>
                          {t.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                    {c.summary && <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 6, lineHeight: 1.5 }}>{c.summary}</div>}
                  </button>
                  {expandedCallId === c.id && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: 14, background: '#061322' }}>
                      {c.transcript ? (
                        <pre style={{ fontSize: 12, color: '#7BAED4', fontFamily: 'inherit', margin: 0, whiteSpace: 'pre-wrap' as const, lineHeight: 1.7, marginBottom: 10 }}>{c.transcript}</pre>
                      ) : (
                        <div style={{ fontSize: 12, color: '#4A7FBB', marginBottom: 10, fontStyle: 'italic' }}>No transcript captured for this call.</div>
                      )}
                      <button
                        onClick={() => setNotes(n => `${n}${n ? '\n\n' : ''}[${fmtDate(c.call_at)}] ${c.summary ?? c.outcome ?? 'Call note'}`)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', background: 'rgba(74,159,232,0.1)', color: '#4A9FE8', border: '1px solid rgba(74,159,232,0.25)', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}
                      >
                        <StickyNote size={11} /> Add note from this call
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const detailInput: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: '#071829', border: '1px solid rgba(255,255,255,0.1)',
  color: 'white', borderRadius: 9, fontFamily: 'Outfit, sans-serif', fontSize: 14, outline: 'none',
}
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8,
  background: '#E8622A', color: 'white', border: 'none', fontFamily: 'Outfit, sans-serif',
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
}
const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8,
  background: 'transparent', color: '#7BAED4', border: '1px solid rgba(255,255,255,0.1)',
  fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 500, cursor: 'pointer',
}
