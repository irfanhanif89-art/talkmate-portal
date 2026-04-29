'use client'

import Link from 'next/link'
import { ArrowLeft, Download } from 'lucide-react'
import { useState } from 'react'

export default function ContactsExportPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function exportCsv() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/contacts/export')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `talkmate-contacts-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError((e as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <div style={{ padding: 28, color: '#F2F6FB', maxWidth: 720 }}>
      <Link href="/contacts" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#7BAED4', textDecoration: 'none', marginBottom: 18 }}>
        <ArrowLeft size={14} /> All contacts
      </Link>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', marginBottom: 6 }}>Export contacts</h1>
      <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 24 }}>
        Download every contact, with name, phone, email, tags, call counts, first/last seen, notes, and industry data fields.
      </p>

      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 28, textAlign: 'center' }}>
        <Download size={36} color="#E8622A" style={{ marginBottom: 14 }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginBottom: 8 }}>One-click CSV export</div>
        <div style={{ fontSize: 13, color: '#7BAED4', marginBottom: 22, lineHeight: 1.6 }}>
          The file works in Excel, Numbers, Google Sheets, or any CRM.
        </div>
        <button
          onClick={exportCsv}
          disabled={busy}
          style={{ background: '#E8622A', color: 'white', border: 'none', borderRadius: 10, padding: '12px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}
        >
          {busy ? 'Building file…' : 'Export all contacts as CSV'}
        </button>
        {error && <div style={{ marginTop: 14, fontSize: 13, color: '#EF4444' }}>{error}</div>}
      </div>
    </div>
  )
}
