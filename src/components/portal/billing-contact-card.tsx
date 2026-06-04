'use client'

// Session 4B — self-contained Billing Contact card. Manages its own fetch +
// save against /api/settings/billing-contact so it can drop into the settings
// page without touching the page's monolithic save logic.
import { useEffect, useState } from 'react'

export default function BillingContactCard({ adminClientId }: { adminClientId?: string }) {
  const qs = adminClientId ? `?adminClientId=${adminClientId}` : ''
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/settings/billing-contact${qs}`)
        if (!r.ok) return
        const d = await r.json()
        if (cancelled) return
        setName(d.name ?? '')
        setEmail(d.email ?? '')
        setEnabled(d.monthlySummaryEnabled !== false)
      } catch { /* silent */ }
    })()
    return () => { cancelled = true }
  }, [qs])

  async function save() {
    setSaving(true); setMsg('')
    try {
      const r = await fetch(`/api/settings/billing-contact${qs}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, monthlySummaryEnabled: enabled }),
      })
      const d = await r.json().catch(() => ({}))
      setMsg(r.ok ? 'Saved' : (d.error === 'invalid_email' ? 'Enter a valid email' : 'Could not save'))
    } catch {
      setMsg('Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground">Monthly summary recipient</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        The monthly TalkMate performance summary is sent to this person as well as you. Add your accountant, bookkeeper, or business partner.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Name</span>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Email</span>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
        Send monthly summary
      </label>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="rounded-md bg-[#E8622A] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  )
}
