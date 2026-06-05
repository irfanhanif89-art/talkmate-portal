'use client'

// Session 4B Phase C — self-contained referral card. Neutral copy (no specific
// credit/free-month claim until the mechanism + terms exist).
import { useEffect, useState } from 'react'

export default function ReferralCard({ adminClientId }: { adminClientId?: string }) {
  const qs = adminClientId ? `?adminClientId=${adminClientId}` : ''
  const [link, setLink] = useState('')
  const [referred, setReferred] = useState(0)
  const [credits, setCredits] = useState(0)
  const [copied, setCopied] = useState(false)
  const [smsConsent, setSmsConsent] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [r, c] = await Promise.all([
          fetch(`/api/referral${qs}`),
          fetch(`/api/settings/sms-consent${qs}`),
        ])
        if (r.ok) {
          const d = await r.json()
          if (!cancelled) { setLink(d.link ?? ''); setReferred(d.referredCount ?? 0); setCredits(d.creditsEarned ?? 0) }
        }
        if (c.ok) {
          const d = await c.json()
          if (!cancelled) setSmsConsent(d.consent === true)
        }
      } catch { /* silent */ }
    })()
    return () => { cancelled = true }
  }, [qs])

  async function toggleConsent(next: boolean) {
    setSmsConsent(next)
    try {
      await fetch(`/api/settings/sms-consent${qs}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: next }),
      })
    } catch { setSmsConsent(!next) }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* silent */ }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground">Refer a business</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Know another business that could use TalkMate? Share your link. We will thank you both when they join.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          readOnly value={link}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <button onClick={copy} disabled={!link}
          className="rounded-md bg-[#E8622A] px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{referred} referred · {credits} credits earned</div>
      <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={smsConsent} onChange={e => toggleConsent(e.target.checked)} className="mt-0.5" />
        <span>Okay to send me the occasional SMS about referrals and account tips. You can turn this off anytime, and every message includes a STOP option.</span>
      </label>
    </div>
  )
}
