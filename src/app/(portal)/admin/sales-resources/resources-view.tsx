'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Plus, Eye, Users, Archive } from 'lucide-react'
import { formatDate } from '@/lib/sales-format'

export interface ResourceRow {
  id: string
  title: string
  description: string | null
  file_name: string
  file_type: string
  file_size: number
  is_active: boolean
  created_at: string
  assigned_rep_ids: string[]
}

export interface RepOption {
  id: string
  full_name: string
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
const tdStyle: React.CSSProperties = { padding: '12px 8px', fontSize: 14, borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top' }

function fileBadge(type: string) {
  const isHtml = type === 'text/html'
  const label = isHtml ? 'HTML' : 'PDF'
  const colour = isHtml ? '#a78bfa' : '#22D3EE'
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, color: colour, background: `${colour}22`, border: `1px solid ${colour}55` }}>{label}</span>
  )
}

function visibilityLabel(r: ResourceRow, reps: RepOption[]) {
  if (r.assigned_rep_ids.length === 0) return 'All reps'
  const names = r.assigned_rep_ids
    .map(id => reps.find(x => x.id === id)?.full_name)
    .filter(Boolean) as string[]
  if (names.length === 0) return `${r.assigned_rep_ids.length} rep(s)`
  if (names.length <= 2) return names.join(', ')
  return `${names[0]}, ${names[1]} +${names.length - 2}`
}

export default function ResourcesView({ resources, reps }: { resources: ResourceRow[]; reps: RepOption[] }) {
  const router = useRouter()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [managing, setManaging] = useState<ResourceRow | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const open = (r: ResourceRow) => {
    // Streamed through our origin so HTML renders (and PDFs preview) inline.
    window.open(`/api/admin/sales-resources/${r.id}/view`, '_blank', 'noopener,noreferrer')
  }

  const archive = async (r: ResourceRow) => {
    if (!window.confirm(`Archive "${r.title}"? It will disappear from every rep's portal. This can't be undone from here.`)) return
    setBusy(r.id)
    try {
      const res = await fetch(`/api/admin/sales-resources/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      })
      const json = await res.json()
      if (!json.ok) alert(json.error || 'Archive failed')
      else router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={22} /> Sales Resources
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', margin: '4px 0 0' }}>
            Upload PDF or HTML documents for your sales reps. Shared with everyone by default, or restrict to specific reps.
          </p>
        </div>
        <button style={btnPrimary} onClick={() => setUploadOpen(true)}>
          <Plus size={16} /> Upload Resource
        </button>
      </div>

      <div style={card}>
        {resources.length === 0 ? (
          <div style={{ padding: '40px 12px', textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>
            No resources yet. Upload your first PDF or HTML file.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Title</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Visibility</th>
                  <th style={thStyle}>Uploaded</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {resources.map(r => (
                  <tr key={r.id}>
                    <td style={tdStyle}>
                      <strong>{r.title}</strong>
                      {r.description && <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 2 }}>{r.description}</div>}
                      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4 }}>{r.file_name}</div>
                    </td>
                    <td style={tdStyle}>{fileBadge(r.file_type)}</td>
                    <td style={tdStyle}>{visibilityLabel(r, reps)}</td>
                    <td style={tdStyle}>{formatDate(r.created_at)}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button style={btnGhost} disabled={busy === r.id} onClick={() => open(r)}><Eye size={12} /> Open</button>
                        <button style={btnGhost} onClick={() => setManaging(r)}><Users size={12} /> Manage access</button>
                        <button style={btnGhost} disabled={busy === r.id} onClick={() => archive(r)}><Archive size={12} /> Archive</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {uploadOpen && (
        <UploadModal reps={reps} onClose={() => setUploadOpen(false)} onSaved={() => { setUploadOpen(false); router.refresh() }} />
      )}

      {managing && (
        <ManageAccessModal
          resource={managing}
          reps={reps}
          onClose={() => setManaging(null)}
          onSaved={() => { setManaging(null); router.refresh() }}
        />
      )}
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50,
}
const modal: React.CSSProperties = {
  background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14, padding: 24, width: '100%', maxWidth: 560,
  fontFamily: 'Outfit, sans-serif', color: 'white',
  maxHeight: '90vh', display: 'flex', flexDirection: 'column',
}
const labelS: React.CSSProperties = { display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 6, fontWeight: 600 }
const inputS: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  background: '#061322', border: '1px solid rgba(255,255,255,0.12)',
  color: 'white', fontFamily: 'inherit', fontSize: 14,
}
const errBox: React.CSSProperties = { background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)', color: '#fecaca', padding: 10, borderRadius: 8, fontSize: 13, marginTop: 10 }
const cancelBtn: React.CSSProperties = { background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '10px 18px', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }
const saveBtn: React.CSSProperties = { background: '#22D3EE', color: '#061322', border: 'none', padding: '10px 18px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }

function RepPicker({ reps, selected, toggle }: { reps: RepOption[]; selected: Set<string>; toggle: (id: string) => void }) {
  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 8, maxHeight: 200, overflowY: 'auto', background: '#061322' }}>
      {reps.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, padding: 8 }}>No active reps.</div>
      ) : reps.map(rep => (
        <label key={rep.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', cursor: 'pointer', fontSize: 14 }}>
          <input type="checkbox" checked={selected.has(rep.id)} onChange={() => toggle(rep.id)} style={{ width: 16, height: 16, accentColor: '#22D3EE' }} />
          {rep.full_name}
        </label>
      ))}
    </div>
  )
}

function UploadModal({ reps, onClose, onSaved }: { reps: RepOption[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [restrict, setRestrict] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const pickFile = (f: File | null) => {
    setError(null)
    if (!f) { setFile(null); return }
    if (f.type !== 'application/pdf' && f.type !== 'text/html') {
      setError('Only PDF or HTML files are accepted')
      setFile(null)
      return
    }
    if (f.size > 20 * 1024 * 1024) {
      setError('Max file size is 20MB')
      setFile(null)
      return
    }
    setFile(f)
  }

  const submit = async () => {
    setError(null)
    if (!title.trim()) { setError('Title is required'); return }
    if (!file) { setError('Choose a PDF or HTML file'); return }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('title', title.trim())
      fd.append('description', description.trim())
      fd.append('file', file)
      if (restrict) fd.append('repIds', JSON.stringify(Array.from(selected)))
      const res = await fetch('/api/admin/sales-resources', { method: 'POST', body: fd })
      const json = await res.json()
      if (!json.ok) setError(json.error || 'Upload failed')
      else { if (json.warning) alert(json.warning); onSaved() }
    } catch {
      setError('Upload failed — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 20, margin: '0 0 16px' }}>Upload Resource</h2>

        <div style={{ overflowY: 'auto', paddingRight: 2 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelS}>Title</label>
            <input style={inputS} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Objection Handling Cheatsheet" />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelS}>Description (optional)</label>
            <input style={inputS} value={description} onChange={e => setDescription(e.target.value)} placeholder="Short note about this resource" />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelS}>File (PDF or HTML, max 20MB)</label>
            <input type="file" accept=".pdf,.html,application/pdf,text/html" onChange={e => pickFile(e.target.files?.[0] ?? null)} style={{ ...inputS, padding: 8 }} />
            {file && <div style={{ color: '#7BAED4', fontSize: 12, marginTop: 6 }}>{file.name} ({Math.round(file.size / 1024)} KB)</div>}
          </div>

          <div style={{ marginBottom: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              <input type="checkbox" checked={restrict} onChange={e => setRestrict(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#22D3EE' }} />
              Restrict to specific reps
            </label>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '4px 0 8px 26px' }}>
              Leave unchecked to share with every rep.
            </div>
            {restrict && <RepPicker reps={reps} selected={selected} toggle={toggle} />}
          </div>
        </div>

        {error && <div style={errBox}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button style={cancelBtn} onClick={onClose} disabled={submitting}>Cancel</button>
          <button style={saveBtn} onClick={submit} disabled={submitting}>{submitting ? 'Uploading...' : 'Upload'}</button>
        </div>
      </div>
    </div>
  )
}

function ManageAccessModal({ resource, reps, onClose, onSaved }: { resource: ResourceRow; reps: RepOption[]; onClose: () => void; onSaved: () => void }) {
  const [restrict, setRestrict] = useState(resource.assigned_rep_ids.length > 0)
  const [selected, setSelected] = useState<Set<string>>(new Set(resource.assigned_rep_ids))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const save = async () => {
    setError(null)
    const repIds = restrict ? Array.from(selected) : []
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/sales-resources/${resource.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repIds }),
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
        <h2 style={{ fontSize: 20, margin: '0 0 4px' }}>Manage access</h2>
        <p style={{ color: 'rgba(255,255,255,0.65)', margin: '0 0 16px', fontSize: 13 }}>{resource.title}</p>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
          <input type="checkbox" checked={restrict} onChange={e => setRestrict(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#22D3EE' }} />
          Restrict to specific reps
        </label>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '4px 0 8px 26px' }}>
          Unchecked = shared with every rep.
        </div>
        {restrict && <RepPicker reps={reps} selected={selected} toggle={toggle} />}

        {error && <div style={errBox}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button style={cancelBtn} onClick={onClose} disabled={submitting}>Cancel</button>
          <button style={saveBtn} onClick={save} disabled={submitting}>{submitting ? 'Saving...' : 'Save access'}</button>
        </div>
      </div>
    </div>
  )
}
