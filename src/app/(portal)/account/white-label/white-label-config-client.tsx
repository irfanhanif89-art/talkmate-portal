'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Lock, ExternalLink } from 'lucide-react'
import type { WhiteLabelConfig } from '@/lib/white-label'

interface Props {
  businessName: string
  partnerTier: string | null
  canHideBranding: boolean
  initialConfig: WhiteLabelConfig | null
}

export default function WhiteLabelConfigClient({ businessName, partnerTier, canHideBranding, initialConfig }: Props) {
  const [brandName, setBrandName] = useState(initialConfig?.brand_name ?? businessName)
  const [logoUrl, setLogoUrl] = useState(initialConfig?.brand_logo_url ?? '')
  const [primaryColor, setPrimaryColor] = useState(initialConfig?.primary_color ?? '#E8622A')
  const [secondaryColor, setSecondaryColor] = useState(initialConfig?.secondary_color ?? '#061322')
  const [accentColor, setAccentColor] = useState(initialConfig?.accent_color ?? '#1565C0')
  const [supportEmail, setSupportEmail] = useState(initialConfig?.support_email ?? '')
  const [supportPhone, setSupportPhone] = useState(initialConfig?.support_phone ?? '')
  const [hideBranding, setHideBranding] = useState(initialConfig?.hide_talkmate_branding ?? false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const subdomain = initialConfig?.portal_subdomain ?? null

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/white-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_name: brandName,
          brand_logo_url: logoUrl || null,
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          accent_color: accentColor,
          support_email: supportEmail || null,
          support_phone: supportPhone || null,
          hide_talkmate_branding: canHideBranding ? hideBranding : false,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Save failed')
      setMsg({ kind: 'ok', text: 'Saved.' })
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const card = {
    background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14, padding: 20, marginBottom: 16,
  } as const

  const label = { fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6, display: 'block' } as const
  const input = { width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white', fontSize: 14, fontFamily: 'Outfit, sans-serif' } as const

  return (
    <div style={{ padding: 28, maxWidth: 760, margin: '0 auto', color: '#F2F6FB' }}>
      <Link href="/settings" style={{ fontSize: 13, color: '#7BAED4', textDecoration: 'none' }}>← Settings</Link>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', marginTop: 8, marginBottom: 4 }}>White label</h1>
      <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 20 }}>
        Partner tier: <span style={{ color: '#E8622A', fontWeight: 700, textTransform: 'capitalize' }}>{partnerTier ?? 'starter'}</span>
      </p>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 14 }}>Brand</div>
        <label style={label}>Brand name</label>
        <input value={brandName} onChange={e => setBrandName(e.target.value)} style={{ ...input, marginBottom: 14 }} />

        <label style={label}>Logo URL</label>
        <input
          value={logoUrl} onChange={e => setLogoUrl(e.target.value)}
          placeholder="https://yourbrand.com/logo.svg"
          style={{ ...input, marginBottom: 4, fontFamily: 'monospace' }}
        />
        <div style={{ fontSize: 11, color: '#7BAED4', marginBottom: 14 }}>
          Paste a hosted logo URL for now — logo upload is coming in the next release.
        </div>

        <label style={label}>Portal subdomain</label>
        <input value={subdomain ?? ''} disabled placeholder="set by admin" style={{ ...input, opacity: 0.6, fontFamily: 'monospace' }} />
        <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 4 }}>
          {subdomain
            ? `Your branded portal is at /wl-preview/${subdomain}.`
            : 'Your subdomain is assigned by the TalkMate team.'}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 14 }}>Colours</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {[
            { label: 'Primary', value: primaryColor, set: setPrimaryColor },
            { label: 'Secondary', value: secondaryColor, set: setSecondaryColor },
            { label: 'Accent', value: accentColor, set: setAccentColor },
          ].map(c => (
            <div key={c.label}>
              <label style={label}>{c.label}</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={c.value}
                  onChange={e => c.set(e.target.value)}
                  style={{ width: 40, height: 40, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, cursor: 'pointer', background: 'transparent' }}
                />
                <input value={c.value} onChange={e => c.set(e.target.value)} style={{ ...input, fontFamily: 'monospace', flex: 1 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 14 }}>Support contact</div>
        <label style={label}>Support email</label>
        <input value={supportEmail} onChange={e => setSupportEmail(e.target.value)} style={{ ...input, marginBottom: 14 }} placeholder="support@yourbrand.com" />
        <label style={label}>Support phone</label>
        <input value={supportPhone} onChange={e => setSupportPhone(e.target.value)} style={{ ...input }} placeholder="+61 ..." />
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 4 }}>TalkMate branding</div>
        <p style={{ fontSize: 12, color: '#7BAED4', marginBottom: 12 }}>
          {canHideBranding
            ? 'Toggle off to remove all "Powered by TalkMate" mentions from your portal.'
            : 'Hiding TalkMate branding requires the Gold partner tier.'}
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: canHideBranding ? 'pointer' : 'not-allowed', opacity: canHideBranding ? 1 : 0.5 }}>
          <input
            type="checkbox"
            checked={hideBranding}
            disabled={!canHideBranding}
            onChange={e => setHideBranding(e.target.checked)}
          />
          <span style={{ fontSize: 13, color: 'white' }}>Hide TalkMate branding</span>
          {!canHideBranding && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(232,98,42,0.18)', color: '#E8622A', letterSpacing: '0.05em' }}>
              <Lock size={11} /> Gold
            </span>
          )}
        </label>
      </div>

      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13,
          background: msg.kind === 'ok' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
          color: msg.kind === 'ok' ? '#22C55E' : '#EF4444',
        }}>{msg.text}</div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={save}
          disabled={busy}
          style={{
            background: '#E8622A', color: 'white', border: 'none',
            padding: '11px 22px', borderRadius: 9, fontSize: 14, fontWeight: 700,
            cursor: busy ? 'wait' : 'pointer', fontFamily: 'Outfit, sans-serif',
            opacity: busy ? 0.7 : 1,
          }}
        >{busy ? 'Saving…' : 'Save changes'}</button>
        {subdomain && (
          <a
            href={`/wl-preview/${subdomain}`}
            target="_blank" rel="noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '11px 18px', borderRadius: 9, fontSize: 14, fontWeight: 600,
              color: 'rgba(255,255,255,0.85)', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)', textDecoration: 'none',
              fontFamily: 'Outfit, sans-serif',
            }}
          >
            <ExternalLink size={14} /> Preview portal
          </a>
        )}
      </div>
    </div>
  )
}
