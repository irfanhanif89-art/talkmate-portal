'use client'

import { useMemo, useState } from 'react'
import { Upload, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react'

interface RepOption {
  id: string
  full_name: string
  email: string
  status: string
}

interface Props {
  reps: RepOption[]
}

// Lead schema fields the admin can map CSV columns into.
// 'skip' = ignore the column. 'notes' is special — multiple unmapped
// columns are concatenated into notes if the admin selects 'notes' for
// each, or via the auto-detect.
const LEAD_FIELDS = [
  { key: 'business_name', label: 'Business name (required)' },
  { key: 'contact_name', label: 'Contact name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'industry', label: 'Industry' },
  { key: 'suburb', label: 'Suburb' },
  { key: 'state', label: 'State' },
  { key: 'website', label: 'Website' },
  { key: 'notes', label: 'Notes (append)' },
  { key: 'skip', label: '— Skip this column —' },
] as const

type FieldKey = typeof LEAD_FIELDS[number]['key']

// Lightweight CSV parser that handles quoted fields containing commas
// and embedded newlines. Returns array of arrays — caller treats row 0
// as the header.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else inQuotes = false
      } else cell += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { row.push(cell); cell = '' }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
      else if (ch === '\r') { /* skip */ }
      else cell += ch
    }
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

// Auto-detect: header text → lead field. Loose matching, case-insensitive.
function autoDetect(header: string): FieldKey {
  const h = header.toLowerCase().trim()
  if (/(business|company)\s*name/.test(h)) return 'business_name'
  if (/(contact|owner|decision\s*maker|first\s*name|name)/.test(h)) return 'contact_name'
  if (/phone|mobile|tel/.test(h)) return 'phone'
  if (/email/.test(h)) return 'email'
  if (/industry|category|trade|sector/.test(h)) return 'industry'
  if (/suburb|city|town/.test(h)) return 'suburb'
  if (/state|region/.test(h)) return 'state'
  if (/website|url|site/.test(h)) return 'website'
  return 'skip'
}

const wrap: React.CSSProperties = {
  padding: 24, fontFamily: 'Outfit, sans-serif', color: 'white',
  background: '#061322', minHeight: '100vh',
}
const card: React.CSSProperties = {
  background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12, padding: 20, marginBottom: 18,
}
const labelS: React.CSSProperties = {
  display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.7)',
  marginBottom: 6, fontWeight: 600,
}
const inputS: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  background: '#061322', border: '1px solid rgba(255,255,255,0.12)',
  color: 'white', fontFamily: 'inherit', fontSize: 14,
}
const btnP: React.CSSProperties = {
  background: '#E8622A', color: 'white', border: 'none',
  padding: '12px 22px', borderRadius: 10, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit', fontSize: 14,
  display: 'inline-flex', alignItems: 'center', gap: 8,
}
const btnG: React.CSSProperties = {
  background: 'transparent', color: 'white',
  border: '1px solid rgba(255,255,255,0.2)',
  padding: '10px 18px', borderRadius: 10, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit', fontSize: 14,
}

export default function LeadsImportClient({ reps }: Props) {
  const [repId, setRepId] = useState('')
  const [industryDefault, setIndustryDefault] = useState('')
  const [source, setSource] = useState('online')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<number, FieldKey>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<
    | { kind: 'ok'; inserted: number; skipped: number; repName: string }
    | { kind: 'err'; message: string }
    | null
  >(null)

  const onFile = async (file: File) => {
    setResult(null)
    setFileName(file.name)
    const text = await file.text()
    const parsed = parseCsv(text)
    if (parsed.length < 2) {
      setResult({ kind: 'err', message: 'CSV must have a header row + at least one data row' })
      setHeaders([]); setRows([]); return
    }
    const hdr = parsed[0]
    const dataRows = parsed.slice(1)
    const initialMap: Record<number, FieldKey> = {}
    hdr.forEach((h, i) => { initialMap[i] = autoDetect(h) })
    setHeaders(hdr)
    setRows(dataRows)
    setMapping(initialMap)
  }

  const previewRows = rows.slice(0, 5)
  const businessNameCol = useMemo(
    () => Object.entries(mapping).find(([, v]) => v === 'business_name')?.[0],
    [mapping],
  )
  const validRowCount = useMemo(() => {
    if (businessNameCol === undefined) return 0
    const col = Number(businessNameCol)
    return rows.filter(r => (r[col] ?? '').trim() !== '').length
  }, [rows, businessNameCol])

  const canImport = !!repId && rows.length > 0 && businessNameCol !== undefined && validRowCount > 0

  const submit = async () => {
    if (!canImport) return
    setSubmitting(true)
    setResult(null)
    try {
      const payload = rows.map(r => {
        const obj: Record<string, string> = {}
        const notesParts: string[] = []
        Object.entries(mapping).forEach(([colIdxStr, field]) => {
          if (field === 'skip') return
          const colIdx = Number(colIdxStr)
          const val = (r[colIdx] ?? '').trim()
          if (!val) return
          if (field === 'notes') {
            notesParts.push(`${headers[colIdx]}: ${val}`)
          } else if (obj[field]) {
            // Two columns mapped to the same field — concat into notes
            notesParts.push(`${headers[colIdx]}: ${val}`)
          } else {
            obj[field] = val
          }
        })
        if (notesParts.length > 0) {
          obj.notes = obj.notes
            ? `${obj.notes}\n${notesParts.join('\n')}`
            : notesParts.join('\n')
        }
        return obj
      })
      const res = await fetch('/api/admin/leads/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rep_id: repId,
          industry: industryDefault || undefined,
          source,
          rows: payload,
        }),
      })
      const json = await res.json()
      if (!json.ok) {
        setResult({ kind: 'err', message: json.error || 'Import failed' })
      } else {
        setResult({
          kind: 'ok',
          inserted: json.inserted,
          skipped: json.skipped ?? 0,
          repName: json.rep_name ?? '',
        })
        setFileName(''); setHeaders([]); setRows([]); setMapping({})
      }
    } catch (e) {
      setResult({ kind: 'err', message: e instanceof Error ? e.message : 'Network error' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 26, margin: '0 0 4px' }}>Import Leads</h1>
      <p style={{ color: 'rgba(255,255,255,0.65)', margin: '0 0 24px' }}>
        Upload a CSV of leads (export your Google Sheet as CSV), pick a rep, map the columns, and bulk-assign.
      </p>

      {/* Step 1 — Pick a rep + defaults */}
      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px' }}>1. Pick a rep + defaults</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelS}>Assign all leads to</label>
            <select style={inputS} value={repId} onChange={e => setRepId(e.target.value)}>
              <option value="">— Select rep —</option>
              {reps.map(r => (
                <option key={r.id} value={r.id}>{r.full_name} ({r.email})</option>
              ))}
            </select>
            {reps.length === 0 && (
              <p style={{ fontSize: 12, color: '#fca5a5', marginTop: 6 }}>
                No active reps. Onboard a contractor first.
              </p>
            )}
          </div>
          <div>
            <label style={labelS}>Industry default (optional)</label>
            <input
              style={inputS}
              value={industryDefault}
              onChange={e => setIndustryDefault(e.target.value)}
              placeholder="e.g. towing, plumbing"
            />
          </div>
          <div>
            <label style={labelS}>Source</label>
            <select style={inputS} value={source} onChange={e => setSource(e.target.value)}>
              <option value="online">online</option>
              <option value="cold_call">cold_call</option>
              <option value="referral">referral</option>
              <option value="walk_in">walk_in</option>
              <option value="other">other</option>
            </select>
          </div>
        </div>
      </div>

      {/* Step 2 — Upload */}
      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px' }}>2. Upload CSV</h2>
        <label
          style={{
            display: 'block', padding: 24, border: '2px dashed rgba(255,255,255,0.18)',
            borderRadius: 12, textAlign: 'center', cursor: 'pointer',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <Upload size={20} style={{ marginBottom: 8, opacity: 0.7 }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {fileName ? fileName : 'Drop a CSV here or click to browse'}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>
            From Google Sheets: File → Download → Comma-separated values (.csv)
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) onFile(f)
            }}
          />
        </label>
      </div>

      {/* Step 3 — Map columns + preview */}
      {headers.length > 0 && (
        <div style={card}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px' }}>
            3. Map columns &nbsp;
            <span style={{ fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.65)' }}>
              ({rows.length} rows · {validRowCount} with business name)
            </span>
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} style={{
                      textAlign: 'left', padding: '6px 8px',
                      borderBottom: '1px solid rgba(255,255,255,0.1)',
                      fontWeight: 600, fontSize: 12, color: 'rgba(255,255,255,0.7)',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
                <tr>
                  {headers.map((_, i) => (
                    <th key={i} style={{ padding: '6px 4px' }}>
                      <select
                        style={{
                          ...inputS, padding: '6px 8px', fontSize: 12,
                          background: mapping[i] === 'business_name' ? 'rgba(34,197,94,0.12)' : '#061322',
                        }}
                        value={mapping[i] ?? 'skip'}
                        onChange={e => setMapping(m => ({ ...m, [i]: e.target.value as FieldKey }))}
                      >
                        {LEAD_FIELDS.map(f => (
                          <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, ri) => (
                  <tr key={ri}>
                    {headers.map((_, ci) => (
                      <td key={ci} style={{
                        padding: '8px',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        color: 'rgba(255,255,255,0.85)', verticalAlign: 'top',
                        maxWidth: 180, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {r[ci] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 5 && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 8 }}>
                Showing first 5 of {rows.length} rows.
              </p>
            )}
          </div>
          {businessNameCol === undefined && (
            <p style={{ fontSize: 13, color: '#fca5a5', marginTop: 12 }}>
              <AlertCircle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Pick one column to map to <strong>Business name</strong> — it's required.
            </p>
          )}
        </div>
      )}

      {/* Step 4 — Submit */}
      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            style={{
              ...btnP,
              opacity: canImport && !submitting ? 1 : 0.45,
              cursor: canImport && !submitting ? 'pointer' : 'not-allowed',
            }}
            disabled={!canImport || submitting}
            onClick={submit}
          >
            {submitting ? 'Importing…' : `Import ${validRowCount} leads`}
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* Result */}
      {result?.kind === 'ok' && (
        <div style={{
          marginTop: 18, padding: 14, borderRadius: 10,
          background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.4)',
          color: '#86efac', fontSize: 14, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <CheckCircle2 size={18} />
          Imported <strong>{result.inserted}</strong> leads for <strong>{result.repName}</strong>.
          {result.skipped > 0 && <span> Skipped {result.skipped}.</span>}
        </div>
      )}
      {result?.kind === 'err' && (
        <div style={{
          marginTop: 18, padding: 14, borderRadius: 10,
          background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)',
          color: '#fca5a5', fontSize: 14, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <AlertCircle size={18} />
          {result.message}
        </div>
      )}

      <div style={{ marginTop: 32, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
        <button style={btnG} onClick={() => window.location.href = '/admin/contractors'}>
          ← Back to admin
        </button>
      </div>
    </div>
  )
}
