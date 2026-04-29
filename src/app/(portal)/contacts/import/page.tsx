'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Upload, Check, AlertTriangle } from 'lucide-react'

interface ParsedRow { values: string[] }

const FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone (required)' },
  { key: 'email', label: 'Email' },
  { key: 'notes', label: 'Notes' },
  { key: 'tags', label: 'Tags (comma-separated)' },
] as const

export default function ContactsImportPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [mapping, setMapping] = useState<Record<string, number>>({}) // talkmate field -> csv column index
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ imported: number; updated: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function parseCSV(text: string) {
    const lines = text.split(/\r?\n/).filter(l => l.length > 0)
    if (lines.length === 0) return { headers: [], rows: [] }
    const split = (line: string) => {
      const out: string[] = []
      let cur = ''
      let inQ = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (ch === '"') inQ = !inQ
        else if (ch === ',' && !inQ) { out.push(cur); cur = '' }
        else cur += ch
      }
      out.push(cur)
      return out.map(s => s.trim())
    }
    const hdrs = split(lines[0])
    const dataRows = lines.slice(1).map(l => ({ values: split(l) }))
    return { headers: hdrs, rows: dataRows }
  }

  async function onFile(file: File) {
    setError(null)
    const text = await file.text()
    const parsed = parseCSV(text)
    if (parsed.headers.length === 0) { setError('CSV is empty.'); return }
    setHeaders(parsed.headers)
    setRows(parsed.rows.slice(0, 5000)) // cap at 5000 rows
    // Best-guess mapping
    const guess: Record<string, number> = {}
    parsed.headers.forEach((h, i) => {
      const lower = h.toLowerCase()
      if (lower.includes('phone') || lower.includes('mobile')) guess.phone = i
      else if (lower.includes('email')) guess.email = i
      else if (lower.includes('name')) guess.name = i
      else if (lower.includes('note')) guess.notes = i
      else if (lower.includes('tag')) guess.tags = i
    })
    setMapping(guess)
    setStep(2)
  }

  function setMap(field: string, idx: string) {
    const i = parseInt(idx, 10)
    setMapping(m => Number.isFinite(i) && i >= 0 ? { ...m, [field]: i } : (() => { const c = { ...m }; delete c[field]; return c })())
  }

  async function runImport() {
    setImporting(true); setError(null)
    if (mapping.phone === undefined) { setError('Phone column is required.'); setImporting(false); return }
    const payload = rows.map(r => {
      const out: Record<string, string> = {}
      for (const f of FIELDS) {
        const idx = mapping[f.key]
        if (idx !== undefined && r.values[idx] !== undefined) out[f.key] = r.values[idx]
      }
      return out
    }).filter(p => p.phone)
    try {
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payload }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Import failed')
      setResult(data)
      setStep(4)
    } catch (e) {
      setError((e as Error).message)
    } finally { setImporting(false) }
  }

  return (
    <div style={{ padding: 28, color: '#F2F6FB', maxWidth: 880 }}>
      <Link href="/contacts" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#7BAED4', textDecoration: 'none', marginBottom: 18 }}>
        <ArrowLeft size={14} /> All contacts
      </Link>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', marginBottom: 6 }}>Import contacts</h1>
      <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 24 }}>Bring an existing customer list across. We&apos;ll de-duplicate by phone number.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
        {(['Upload', 'Map columns', 'Review', 'Done'] as const).map((label, i) => (
          <span key={label} style={{
            fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 99,
            background: step > i + 1 ? 'rgba(34,197,94,0.12)' : step === i + 1 ? 'rgba(232,98,42,0.12)' : 'rgba(255,255,255,0.04)',
            color: step > i + 1 ? '#22C55E' : step === i + 1 ? '#E8622A' : '#7BAED4',
            border: `1px solid ${step === i + 1 ? 'rgba(232,98,42,0.3)' : 'rgba(255,255,255,0.06)'}`,
          }}>
            {step > i + 1 ? <Check size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} /> : `${i + 1}.`} {label}
          </span>
        ))}
      </div>

      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24 }}>
        {error && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.1)', color: '#EF4444', fontSize: 13 }}><AlertTriangle size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} /> {error}</div>}

        {step === 1 && (
          <label style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 48, border: '1.5px dashed rgba(74,159,232,0.3)', borderRadius: 14, cursor: 'pointer',
            background: 'rgba(74,159,232,0.04)',
          }}>
            <Upload size={36} color="#4A9FE8" />
            <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginTop: 14 }}>Drop or pick a CSV file</div>
            <div style={{ fontSize: 13, color: '#7BAED4', marginTop: 4 }}>Phone column is required. Other fields optional.</div>
            <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        )}

        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 6 }}>Map your columns</h2>
            <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 16 }}>Match each TalkMate field to a column from your CSV. Preview shows the first 5 rows.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, marginBottom: 22 }}>
              {FIELDS.map(f => (
                <>
                  <label key={f.key + '-l'} style={{ alignSelf: 'center', fontSize: 13, color: 'white', fontWeight: 600 }}>{f.label}</label>
                  <select
                    key={f.key + '-s'}
                    value={mapping[f.key] !== undefined ? String(mapping[f.key]) : ''}
                    onChange={e => setMap(f.key, e.target.value)}
                    style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 9, padding: '9px 12px', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none' }}
                  >
                    <option value="" style={{ background: '#0A1E38' }}>Skip this field</option>
                    {headers.map((h, i) => <option key={i} value={String(i)} style={{ background: '#0A1E38' }}>{h}</option>)}
                  </select>
                </>
              ))}
            </div>

            <div style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 9, padding: 12, overflowX: 'auto', marginBottom: 18 }}>
              <table style={{ minWidth: '100%', fontSize: 12, color: '#7BAED4', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{headers.map((h, i) => <th key={i} style={{ padding: 6, textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 700 }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>{r.values.map((v, j) => <td key={j} style={{ padding: 6, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{v}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(1)} style={{ background: 'transparent', color: '#7BAED4', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, padding: '10px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Back</button>
              <button onClick={() => setStep(3)} disabled={mapping.phone === undefined} style={{ background: mapping.phone === undefined ? 'rgba(232,98,42,0.4)' : '#E8622A', color: 'white', border: 'none', borderRadius: 9, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Review →</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 6 }}>Ready to import</h2>
            <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 16 }}>{rows.length} rows will be processed. Existing contacts (matched by phone) will have name/email filled in if currently blank, never overwritten.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(2)} style={{ background: 'transparent', color: '#7BAED4', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, padding: '10px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>Back</button>
              <button onClick={runImport} disabled={importing} style={{ background: '#E8622A', color: 'white', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}>
                {importing ? 'Importing…' : `Import ${rows.length} contacts`}
              </button>
            </div>
          </div>
        )}

        {step === 4 && result && (
          <div style={{ textAlign: 'center', padding: '24px 16px' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Check size={26} color="#22C55E" />
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'white', marginBottom: 8 }}>Import complete</div>
            <div style={{ fontSize: 13, color: '#7BAED4', marginBottom: 20 }}>
              {result.imported} new · {result.updated} updated · {result.skipped} skipped
            </div>
            <Link href="/contacts" style={{ background: '#E8622A', color: 'white', borderRadius: 9, padding: '11px 20px', fontSize: 13, fontWeight: 700, textDecoration: 'none', fontFamily: 'Outfit, sans-serif' }}>View contacts →</Link>
          </div>
        )}
      </div>
    </div>
  )
}
