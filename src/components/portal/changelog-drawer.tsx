'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

interface Entry {
  id: string
  title: string
  description: string
  type: 'new' | 'improved' | 'fixed' | string
  emoji?: string | null
  plan_required?: string | null
  published_at: string
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function ChangelogDrawer({ open, onClose }: Props) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let mounted = true
    setLoading(true)
    fetch('/api/changelog', { method: 'GET' })
      .then(r => r.json())
      .then(data => { if (mounted) { setEntries(data.entries ?? []); setLoading(false) } })
      .catch(() => { if (mounted) setLoading(false) })
    // Mark as seen
    fetch('/api/changelog', { method: 'POST' }).catch(() => {})
    return () => { mounted = false }
  }, [open])

  if (!open) return null

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100 }} />
      <aside style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 420, zIndex: 1110,
        background: '#0A1E38', borderLeft: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '-12px 0 32px rgba(0,0,0,0.4)', overflowY: 'auto',
      }}>
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: '#0A1E38', zIndex: 2,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>What&apos;s new in TalkMate</div>
            <div style={{ fontSize: 11, color: '#4A7FBB', marginTop: 2 }}>Latest features and fixes</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: '#7BAED4', cursor: 'pointer', padding: 6 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 22 }}>
          {loading && <div style={{ color: '#4A7FBB', fontSize: 13 }}>Loading…</div>}
          {!loading && entries.length === 0 && (
            <div style={{ color: '#4A7FBB', fontSize: 13 }}>No updates yet.</div>
          )}
          {entries.map(e => (
            <div key={e.id} style={{
              background: '#071829', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12,
              padding: 16, marginBottom: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 22 }}>{e.emoji || '✨'}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'white', flex: 1 }}>{e.title}</span>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 99, letterSpacing: '0.05em', textTransform: 'uppercase',
                  background: e.type === 'new' ? 'rgba(34,197,94,0.15)' : e.type === 'improved' ? 'rgba(74,159,232,0.15)' : 'rgba(245,158,11,0.15)',
                  color: e.type === 'new' ? '#22C55E' : e.type === 'improved' ? '#4A9FE8' : '#F59E0B',
                }}>{e.type}</span>
              </div>
              <p style={{ fontSize: 13, color: '#7BAED4', lineHeight: 1.55 }}>{e.description}</p>
              {e.plan_required && (
                <span style={{ display: 'inline-block', marginTop: 8, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(232,98,42,0.15)', color: '#E8622A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {e.plan_required} feature
                </span>
              )}
              <div style={{ fontSize: 11, color: '#4A7FBB', marginTop: 8 }}>
                {new Date(e.published_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}
