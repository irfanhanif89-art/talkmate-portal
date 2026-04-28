'use client'

import { useState } from 'react'
import { Sparkles, X, Check } from 'lucide-react'

interface ImportedItem {
  name: string
  price: number | null
  category: string
  description?: string
}

interface Props {
  onImported: (count: number) => void
}

// AI Menu Import banner — Brief Part 6 MVP (URL only).
export default function MenuImportBanner({ onImported }: Props) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ImportedItem[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)

  async function scan() {
    setError(null)
    if (!url.trim() || !/^https?:\/\//i.test(url)) {
      setError('Paste a full http(s) URL — like https://yourbusiness.com.au/menu')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/menu-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error || 'Could not scan that URL.')
        setItems([])
      } else {
        setItems(data.items as ImportedItem[])
        setSelected(new Set((data.items as ImportedItem[]).map((_: ImportedItem, i: number) => i)))
      }
    } catch {
      setError('Network error — try again.')
    } finally {
      setLoading(false)
    }
  }

  async function importSelected() {
    if (selected.size === 0) return
    setImporting(true)
    try {
      const chosen = items.filter((_, i) => selected.has(i))
      const res = await fetch('/api/menu-import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: chosen }),
      })
      const data = await res.json()
      if (data.ok) {
        onImported(data.inserted as number)
        setOpen(false)
        setItems([])
        setUrl('')
      } else {
        setError(data.error || 'Could not save items.')
      }
    } finally {
      setImporting(false)
    }
  }

  function toggle(i: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(232,98,42,0.1), rgba(74,159,232,0.06))',
      border: '1px solid rgba(232,98,42,0.25)', borderRadius: 16, padding: 22, marginBottom: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(232,98,42,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Sparkles size={22} color="#E8622A" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>Import your menu in seconds</div>
          <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 3 }}>Paste a website, MenuLog, or Uber Eats URL — TalkMate scans it and pre-fills your services.</div>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} style={{ background: '#E8622A', color: 'white', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
            Import from URL
          </button>
        )}
      </div>

      {open && items.length === 0 && (
        <div style={{ marginTop: 18, padding: 16, background: '#071829', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: error ? 8 : 0 }}>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="Paste your website, MenuLog, or Uber Eats URL"
              style={{
                flex: 1, background: '#0A1E38', border: '1px solid rgba(255,255,255,0.1)', color: 'white',
                borderRadius: 9, padding: '10px 14px', fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none',
              }}
              onKeyDown={e => { if (e.key === 'Enter') scan() }}
            />
            <button onClick={scan} disabled={loading} style={{ background: '#E8622A', color: 'white', border: 'none', borderRadius: 9, padding: '0 18px', fontSize: 13, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', fontFamily: 'Outfit, sans-serif', flexShrink: 0 }}>
              {loading ? 'Scanning…' : 'Scan menu →'}
            </button>
            <button onClick={() => { setOpen(false); setError(null) }} style={{ background: 'transparent', color: '#4A7FBB', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, padding: '0 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Cancel</button>
          </div>
          {error && <div style={{ fontSize: 12, color: '#EF4444', marginTop: 8 }}>{error}</div>}
        </div>
      )}

      {items.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Found {items.length} items</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setSelected(new Set(items.map((_, i) => i)))} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#7BAED4', borderRadius: 7, padding: '6px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Select all</button>
              <button onClick={() => setSelected(new Set())} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#7BAED4', borderRadius: 7, padding: '6px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Clear</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, maxHeight: 320, overflowY: 'auto', padding: 4 }}>
            {items.map((item, i) => {
              const checked = selected.has(i)
              return (
                <label key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  background: checked ? 'rgba(232,98,42,0.08)' : '#071829',
                  border: `1px solid ${checked ? 'rgba(232,98,42,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 9, cursor: 'pointer',
                }}>
                  <div style={{ width: 18, height: 18, flexShrink: 0, borderRadius: 4, background: checked ? '#E8622A' : 'transparent', border: '1.5px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {checked && <Check size={12} color="white" />}
                  </div>
                  <input type="checkbox" checked={checked} onChange={() => toggle(i)} style={{ display: 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: '#4A7FBB' }}>{item.category}</div>
                  </div>
                  {item.price != null
                    ? <div style={{ fontSize: 13, fontWeight: 700, color: '#E8622A' }}>${item.price.toFixed(2)}</div>
                    : <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 99, background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>No price</div>
                  }
                </label>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={importSelected} disabled={importing || selected.size === 0} style={{ background: '#E8622A', color: 'white', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: importing ? 'wait' : 'pointer', fontFamily: 'Outfit, sans-serif', opacity: selected.size === 0 ? 0.5 : 1 }}>
              {importing ? 'Importing…' : `Import ${selected.size} item${selected.size === 1 ? '' : 's'}`}
            </button>
            <button onClick={() => { setItems([]); setSelected(new Set()); setUrl('') }} style={{ background: 'transparent', color: '#4A7FBB', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, padding: '10px 18px', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
              <X size={12} style={{ marginRight: 6, verticalAlign: '-2px' }} /> Discard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
