'use client'

import { useState } from 'react'
import ModalShell from '@/components/sales/modal-shell'
import { formatDateTime } from '@/lib/sales-format'
import type { AdminRepRow } from './admin-sales-team-view'

interface Props {
  rep: AdminRepRow
  onClose: () => void
  onSuccess: () => void
}

export default function ContractManagerModal({ rep, onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [documentName, setDocumentName] = useState('')
  const [policyVersion, setPolicyVersion] = useState('v1')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pickFile(f: File | null) {
    setFile(f)
    if (f) {
      const cleanName = f.name.replace(/\.pdf$/i, '')
      setDocumentName(cleanName)
    }
  }

  async function submit() {
    if (!file) { setError('Choose a PDF first.'); return }
    if (file.type !== 'application/pdf') { setError('Only PDF files are accepted.'); return }
    if (file.size > 20 * 1024 * 1024) { setError('Max file size is 20MB.'); return }
    if (!documentName.trim()) { setError('Document name is required.'); return }

    setSubmitting(true); setError(null)
    const fd = new FormData()
    fd.append('rep_id', rep.id)
    fd.append('file', file)
    fd.append('document_name', documentName.trim())
    fd.append('policy_version', policyVersion.trim() || 'v1')

    const res = await fetch('/api/admin/sales-reps/contract', { method: 'POST', body: fd })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.error ?? 'Upload failed.')
      setSubmitting(false)
      return
    }
    onSuccess()
  }

  return (
    <ModalShell title={`Contract for ${rep.full_name}`} onClose={onClose} maxWidth={520}>
      <div style={{
        padding: 14, marginBottom: 16, borderRadius: 9,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ fontSize: 11, color: '#7BAED4', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Current status</div>
        <div style={{ fontSize: 13, color: 'white' }}>
          {rep.contract_status === 'signed'
            ? <>Signed on <strong>{formatDateTime(rep.contract_signed_on)}</strong></>
            : rep.contract_status === 'pending_signature'
              ? <>Pending rep signature</>
              : <>No contract on file</>}
        </div>
      </div>

      <Field label="Upload new contract (PDF, max 20MB)">
        <input
          type="file"
          accept="application/pdf"
          onChange={e => pickFile(e.target.files?.[0] ?? null)}
          style={{ ...inputStyle, padding: '8px 10px', cursor: 'pointer' }}
        />
      </Field>

      <Field label="Document name">
        <input
          value={documentName}
          onChange={e => setDocumentName(e.target.value)}
          style={inputStyle}
          placeholder="e.g. TalkMate Independent Sales Rep Agreement v1"
        />
      </Field>

      <Field label="Policy version">
        <input
          value={policyVersion}
          onChange={e => setPolicyVersion(e.target.value)}
          style={inputStyle}
          placeholder="v1"
        />
      </Field>

      <p style={{ fontSize: 12, color: '#7BAED4', lineHeight: 1.6, margin: '8px 0 12px' }}>
        Uploading marks any existing pending contract as superseded and emails the rep with a link to review and sign the new version.
      </p>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <button onClick={onClose} style={cancelBtn}>Cancel</button>
        <button
          onClick={submit}
          disabled={!file || submitting}
          style={{
            flex: 1, padding: '11px 14px', borderRadius: 9, border: 'none',
            background: !file || submitting ? '#7B3A1A' : '#E8622A',
            color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 700,
            cursor: !file || submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Uploading…' : 'Upload and Notify Rep'}
        </button>
      </div>
    </ModalShell>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
      <span style={{ fontSize: 11, color: '#7BAED4', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: '#061322', border: '1px solid rgba(255,255,255,0.08)',
  color: 'white', fontSize: 13, outline: 'none', fontFamily: 'Outfit, sans-serif',
}
const cancelBtn: React.CSSProperties = {
  padding: '11px 18px', borderRadius: 9, cursor: 'pointer',
  background: 'transparent', color: '#7BAED4', border: '1px solid rgba(255,255,255,0.1)',
  fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 600,
}
const errorBox: React.CSSProperties = {
  marginBottom: 10, color: '#ef4444', fontSize: 13,
  padding: '8px 12px', borderRadius: 8,
  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
}
