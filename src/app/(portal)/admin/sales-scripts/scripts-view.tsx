'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Plus, Edit, Eye, Power } from 'lucide-react'
import { formatDate, formatDateTime } from '@/lib/sales-format'

export interface ScriptRow {
  id: string
  version: string
  title: string
  content: string
  is_active: boolean
  activated_at: string | null
  created_by: string | null
  created_at: string
  ack_count: number
}

const wrap: React.CSSProperties = { padding: 24, fontFamily: 'Outfit, sans-serif', color: 'white', background: '#061322', minHeight: '100vh' }
const card: React.CSSProperties = { background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 }
const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: '#22D3EE', color: '#061322', border: 'none',
  padding: '10px 16px', borderRadius: 10, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 14,
}
const btnGhost: React.CSSProperties = {
  background: 'transparent', color: '#22D3EE', border: '1px solid rgba(34,211,238,0.4)',
  padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
  display: 'inline-flex', alignItems: 'center', gap: 4,
}
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 8px', fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }
const tdStyle: React.CSSProperties = { padding: '12px 8px', fontSize: 14, borderBottom: '1px solid rgba(255,255,255,0.05)' }

function StatusBadge({ s }: { s: ScriptRow }) {
  if (s.is_active) {
    return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#22c55e', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)' }}>Active</span>
  }
  if (s.activated_at) {
    return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#94a3b8', background: 'rgba(148,163,184,0.15)', border: '1px solid rgba(148,163,184,0.3)' }}>Superseded</span>
  }
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#94a3b8', background: 'rgba(148,163,184,0.15)', border: '1px solid rgba(148,163,184,0.3)' }}>Draft</span>
}

export default function ScriptsView({ scripts }: { scripts: ScriptRow[] }) {
  const router = useRouter()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ScriptRow | null>(null)
  const [viewing, setViewing] = useState<ScriptRow | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const activate = async (s: ScriptRow) => {
    const prev = scripts.find(x => x.is_active && x.id !== s.id)
    const ok = window.confirm(
      prev
        ? `Activating Version ${s.version} will deactivate Version ${prev.version}. All active contractors will need to re-acknowledge the new script. Proceed?`
        : `Activate Version ${s.version}?`
    )
    if (!ok) return
    setBusy(s.id)
    try {
      const res = await fetch(`/api/sales-scripts/${s.id}/activate`, { method: 'PATCH' })
      const json = await res.json()
      if (!json.ok) alert(json.error || 'Activation failed')
      else router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={22} /> Sales Scripts
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', margin: '4px 0 0' }}>
            Version-controlled approved sales scripts. Contractors acknowledge the active script when they sign.
          </p>
        </div>
        <button style={btnPrimary} onClick={() => { setEditing(null); setEditorOpen(true) }}>
          <Plus size={16} /> New Script Version
        </button>
      </div>

      <div style={card}>
        {scripts.length === 0 ? (
          <div style={{ padding: '40px 12px', textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>
            No scripts yet. Create your first version.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Version</th>
                  <th style={thStyle}>Title</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Activated</th>
                  <th style={thStyle}>Acknowledgements</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {scripts.map(s => (
                  <tr key={s.id}>
                    <td style={tdStyle}><strong>{s.version}</strong></td>
                    <td style={tdStyle}>{s.title}</td>
                    <td style={tdStyle}><StatusBadge s={s} /></td>
                    <td style={tdStyle}>{formatDate(s.activated_at)}</td>
                    <td style={tdStyle}>{s.ack_count}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button style={btnGhost} onClick={() => setViewing(s)}><Eye size={12} /> View</button>
                        {!s.activated_at && !s.is_active && (
                          <button style={btnGhost} onClick={() => { setEditing(s); setEditorOpen(true) }}>
                            <Edit size={12} /> Edit
                          </button>
                        )}
                        {!s.is_active && (
                          <button style={btnGhost} disabled={busy === s.id} onClick={() => activate(s)}>
                            <Power size={12} /> {busy === s.id ? 'Activating...' : 'Activate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editorOpen && (
        <ScriptEditorModal
          script={editing}
          onClose={() => setEditorOpen(false)}
          onSaved={() => { setEditorOpen(false); router.refresh() }}
        />
      )}

      {viewing && (
        <ScriptViewerModal script={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}

function ScriptEditorModal({
  script, onClose, onSaved,
}: { script: ScriptRow | null; onClose: () => void; onSaved: () => void }) {
  const [version, setVersion] = useState(script?.version ?? '')
  const [title, setTitle] = useState(script?.title ?? '')
  const [content, setContent] = useState(script?.content ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50,
  }
  const modal: React.CSSProperties = {
    background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14, padding: 24, width: '100%', maxWidth: 720,
    fontFamily: 'Outfit, sans-serif', color: 'white',
    maxHeight: '90vh', display: 'flex', flexDirection: 'column',
  }
  const labelS: React.CSSProperties = { display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 6, fontWeight: 600 }
  const inputS: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    background: '#061322', border: '1px solid rgba(255,255,255,0.12)',
    color: 'white', fontFamily: 'inherit', fontSize: 14,
  }

  const submit = async () => {
    setError(null)
    if (!version.trim() || !title.trim() || !content.trim()) {
      setError('Version, title, and content are all required')
      return
    }
    setSubmitting(true)
    try {
      const url = script ? `/api/sales-scripts/${script.id}` : '/api/sales-scripts'
      const method = script ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: version.trim(), title: title.trim(), content: content.trim() }),
      })
      const json = await res.json()
      if (!json.ok) setError(json.error || 'Save failed')
      else onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 20, margin: '0 0 16px' }}>
          {script ? 'Edit Draft Script' : 'New Script Version'}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
          <div>
            <label style={labelS}>Version</label>
            <input style={inputS} value={version} onChange={e => setVersion(e.target.value)} placeholder="1.0, 1.1, 2.0..." />
          </div>
          <div>
            <label style={labelS}>Title</label>
            <input style={inputS} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. TalkMate Sales Script - Restaurants" />
          </div>
        </div>

        <div style={{ marginTop: 12, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <label style={labelS}>Script content</label>
          <textarea
            style={{ ...inputS, minHeight: 280, fontFamily: 'ui-monospace, SFMono-Regular, monospace', resize: 'vertical' }}
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Paste or type the full approved script here..."
          />
        </div>

        {error && (
          <div style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)', color: '#fecaca', padding: 10, borderRadius: 8, fontSize: 13, marginTop: 10 }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button
            style={{ background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '10px 18px', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}
            onClick={onClose}
            disabled={submitting}
          >Cancel</button>
          <button
            style={{ background: '#22D3EE', color: '#061322', border: 'none', padding: '10px 18px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}
            onClick={submit}
            disabled={submitting}
          >{submitting ? 'Saving...' : 'Save as Draft'}</button>
        </div>
      </div>
    </div>
  )
}

function ScriptViewerModal({ script, onClose }: { script: ScriptRow; onClose: () => void }) {
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50,
  }
  const modal: React.CSSProperties = {
    background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14, padding: 24, width: '100%', maxWidth: 760,
    fontFamily: 'Outfit, sans-serif', color: 'white',
    maxHeight: '90vh', display: 'flex', flexDirection: 'column',
  }
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 20, margin: '0 0 4px' }}>{script.title}</h2>
        <p style={{ color: 'rgba(255,255,255,0.65)', margin: '0 0 12px', fontSize: 13 }}>
          Version {script.version} {script.activated_at ? `(activated ${formatDateTime(script.activated_at)})` : '(draft)'}
        </p>
        <div style={{
          flex: 1, overflowY: 'auto', padding: 16,
          background: '#061322', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10, lineHeight: 1.6, fontSize: 14, whiteSpace: 'pre-wrap',
        }}>
          {script.content}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            style={{ background: '#22D3EE', color: '#061322', border: 'none', padding: '10px 18px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}
            onClick={onClose}
          >Close</button>
        </div>
      </div>
    </div>
  )
}
