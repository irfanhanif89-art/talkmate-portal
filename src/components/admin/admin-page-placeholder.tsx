'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'

// Placeholder used for admin-portal subpages that do not yet have a
// service-role-aware mirror. The admin still sees the same nav location,
// but for full CRUD they're handed off to the existing impersonation
// flow which signs them in temporarily as the client.
export default function AdminPagePlaceholder({
  clientId,
  pageLabel,
  clientPath,
  description,
}: {
  clientId: string
  pageLabel: string
  clientPath: string
  description: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function openClientView() {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/impersonate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Could not open client view')
        return
      }
      // Append the desired next path so the magic link lands directly on
      // the right page inside the client portal.
      const url = new URL(data.url)
      const next = encodeURIComponent(`${clientPath}?impersonate=1&biz=${clientId}`)
      url.searchParams.set('next', next)
      window.open(url.toString(), '_blank')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 28, maxWidth: 880, margin: '0 auto', color: '#F2F6FB', fontFamily: 'Outfit, sans-serif' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>{pageLabel}</h1>
      <p style={{ fontSize: 13, color: '#7BAED4', margin: '6px 0 24px' }}>{description}</p>

      <div style={{
        background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14, padding: 24,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 6 }}>
          Open in client view
        </div>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: '0 0 16px', lineHeight: 1.6 }}>
          For full CRUD on {pageLabel.toLowerCase()}, open this client's portal as them in a new tab. You'll come back here when you're done. The red "Admin view" banner shows you you're impersonating.
        </p>
        <button
          onClick={openClientView}
          disabled={busy}
          style={{
            padding: '11px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            background: '#E8622A', color: 'white', border: 'none', cursor: busy ? 'wait' : 'pointer',
            fontFamily: 'Outfit, sans-serif', display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          <ExternalLink size={14} /> {busy ? 'Opening…' : `Open ${pageLabel} as client`}
        </button>
        {error && (
          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 8,
            background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)',
            color: '#FCA5A5', fontSize: 12,
          }}>{error}</div>
        )}
      </div>
    </div>
  )
}
