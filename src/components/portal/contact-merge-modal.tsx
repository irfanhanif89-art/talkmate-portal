'use client'

import { useEffect, useState } from 'react'
import { X, Search, ArrowRight, ArrowLeftRight } from 'lucide-react'

interface ContactSummary {
  id: string
  name: string | null
  phone: string
  call_count: number
  last_seen: string
  tags: string[] | null
}

interface Props {
  open: boolean
  onClose: () => void
  currentContact: ContactSummary
  onMerged: () => void
}

function formatPhone(phone: string): string {
  const m = phone.match(/^\+61(\d{3})(\d{3})(\d{3})$/)
  return m ? `+61 ${m[1]} ${m[2]} ${m[3]}` : phone
}

export default function ContactMergeModal({ open, onClose, currentContact, onMerged }: Props) {
  const [step, setStep] = useState<'search' | 'preview'>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContactSummary[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<ContactSummary | null>(null)
  const [keepIsCurrent, setKeepIsCurrent] = useState(true)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setStep('search'); setQuery(''); setResults([]); setSelected(null); setError(null); setKeepIsCurrent(true)
    }
  }, [open])

  useEffect(() => {
    if (!open || step !== 'search') return
    const t = setTimeout(async () => {
      if (query.trim().length < 2) { setResults([]); return }
      setSearching(true)
      try {
        const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(query.trim())}&exclude=${currentContact.id}`)
        const data = await res.json()
        if (data.ok) setResults(data.contacts)
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query, open, step, currentContact.id])

  if (!open) return null

  const keep = keepIsCurrent ? currentContact : selected!
  const merge = keepIsCurrent ? selected : currentContact

  async function confirmMerge() {
    if (!keep || !merge) return
    setMerging(true); setError(null)
    try {
      const res = await fetch('/api/contacts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep_id: keep.id, merge_id: merge.id }),
      })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error || 'Merge failed')
        return
      }
      onMerged()
    } finally {
      setMerging(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 20px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, width: '100%', maxWidth: 720, padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'white' }}>
            {step === 'search' ? 'Find contact to merge with' : 'Confirm merge'}
          </h2>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: '#7BAED4', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {step === 'search' && (
          <>
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#4A7FBB' }} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name or phone…"
                autoFocus
                style={{ width: '100%', padding: '11px 14px 11px 36px', background: '#071829', border: '1px solid rgba(255,255,255,0.08)', color: 'white', borderRadius: 9, fontFamily: 'Outfit, sans-serif', fontSize: 14, outline: 'none' }}
              />
            </div>

            {searching && <div style={{ fontSize: 13, color: '#7BAED4' }}>Searching…</div>}
            {!searching && query.length >= 2 && results.length === 0 && (
              <div style={{ padding: 18, fontSize: 13, color: '#7BAED4', textAlign: 'center' }}>No contacts match.</div>
            )}
            {results.length > 0 && (
              <div style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden', maxHeight: 360, overflowY: 'auto' }}>
                {results.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => { setSelected(c); setStep('preview') }}
                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'transparent', border: 'none', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Outfit, sans-serif' }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>{c.name || <span style={{ color: '#7BAED4' }}>Unknown</span>}</div>
                      <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 2 }}>{formatPhone(c.phone)} · {c.call_count} call{c.call_count === 1 ? '' : 's'}</div>
                    </div>
                    <ArrowRight size={14} color="#4A7FBB" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {step === 'preview' && selected && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <ContactPreview label="Keep this one" contact={keep!} highlight />
              <ContactPreview label="Merge into above" contact={merge!} />
            </div>

            <button
              onClick={() => setKeepIsCurrent(k => !k)}
              style={{ width: '100%', padding: 10, background: 'transparent', border: '1px dashed rgba(74,159,232,0.3)', color: '#4A9FE8', borderRadius: 9, cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 }}
            >
              <ArrowLeftRight size={13} /> Swap
            </button>

            <div style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 11, padding: 14, marginBottom: 14, fontSize: 13, color: '#7BAED4', lineHeight: 1.6 }}>
              The kept contact will have <strong style={{ color: 'white' }}>{(keep!.call_count ?? 0) + (merge!.call_count ?? 0)} total calls</strong> from both records. Tags will be combined. The other contact will be marked merged and disappear from your list.
            </div>

            {error && <div style={{ marginBottom: 12, fontSize: 13, color: '#EF4444', textAlign: 'center' }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('search')} disabled={merging} style={{ flex: 1, padding: '11px', background: 'transparent', color: '#7BAED4', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Back</button>
              <button onClick={confirmMerge} disabled={merging} style={{ flex: 2, padding: '11px', background: '#E8622A', color: 'white', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                {merging ? 'Merging…' : 'Confirm merge'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ContactPreview({ label, contact, highlight }: { label: string; contact: ContactSummary; highlight?: boolean }) {
  return (
    <div style={{
      padding: 14, background: '#071829',
      border: `1.5px solid ${highlight ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 12,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: highlight ? '#22C55E' : '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 4 }}>{contact.name || 'Unknown'}</div>
      <div style={{ fontSize: 12, color: '#7BAED4' }}>{formatPhone(contact.phone)}</div>
      <div style={{ fontSize: 11, color: '#4A7FBB', marginTop: 8 }}>{contact.call_count} call{contact.call_count === 1 ? '' : 's'}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
        {(contact.tags ?? []).slice(0, 3).map(t => (
          <span key={t} style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(74,159,232,0.12)', color: '#4A9FE8' }}>{t.replace(/_/g, ' ')}</span>
        ))}
      </div>
    </div>
  )
}
