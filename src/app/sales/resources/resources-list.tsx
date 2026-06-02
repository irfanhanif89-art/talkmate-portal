'use client'

import { useState } from 'react'
import { FileText, FileCode, ExternalLink } from 'lucide-react'

export interface RepResource {
  id: string
  title: string
  description: string | null
  file_type: string
}

export default function ResourcesList({ resources }: { resources: RepResource[] }) {
  const [busy, setBusy] = useState<string | null>(null)

  const open = (id: string) => {
    // Streamed through our origin so HTML renders (and PDFs preview) inline.
    setBusy(id)
    window.open(`/api/sales/resources/${id}/view`, '_blank', 'noopener,noreferrer')
    // Clear the transient "Opening..." state shortly after the tab opens.
    setTimeout(() => setBusy(null), 800)
  }

  if (resources.length === 0) {
    return (
      <div style={{
        background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12, padding: '40px 16px', textAlign: 'center', color: '#7BAED4', fontSize: 14,
      }}>
        No resources have been shared with you yet.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {resources.map(r => {
        const isHtml = r.file_type === 'text/html'
        const Icon = isHtml ? FileCode : FileText
        return (
          <button
            key={r.id}
            onClick={() => open(r.id)}
            disabled={busy === r.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
              background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12, padding: 16, cursor: 'pointer',
              fontFamily: 'Outfit, sans-serif', color: 'white', width: '100%',
            }}
          >
            <div style={{
              width: 42, height: 42, borderRadius: 10, flexShrink: 0,
              background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22D3EE',
            }}>
              <Icon size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{r.title}</div>
              {r.description && <div style={{ fontSize: 13, color: '#7BAED4', marginTop: 2 }}>{r.description}</div>}
            </div>
            <div style={{ color: '#22D3EE', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
              {busy === r.id ? 'Opening...' : <>Open <ExternalLink size={14} /></>}
            </div>
          </button>
        )
      })}
    </div>
  )
}
