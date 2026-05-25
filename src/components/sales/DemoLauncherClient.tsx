'use client'

import { useState } from 'react'
import {
  Truck, UtensilsCrossed, Home, Wrench, Stethoscope, Droplets, Zap, Wind,
  Heart, ShoppingBag, Briefcase, Sparkles, Dumbbell, Car, Copy, Check,
  Loader2, Phone, type LucideIcon,
} from 'lucide-react'
import { SALES_INDUSTRY_SLUGS, SALES_INDUSTRY_LABELS, type SalesIndustrySlug } from '@/lib/industry-slugs'
import { DEMO_TALKING_POINTS } from '@/lib/demo-talking-points'

interface Props {
  demoDisplay: string
}

const INDUSTRY_ICONS: Record<SalesIndustrySlug, LucideIcon> = {
  towing: Truck,
  restaurants: UtensilsCrossed,
  real_estate: Home,
  trades: Wrench,
  healthcare: Stethoscope,
  plumbing: Droplets,
  electrical: Zap,
  hvac: Wind,
  ndis: Heart,
  retail: ShoppingBag,
  professional: Briefcase,
  beauty: Sparkles,
  gym: Dumbbell,
  auto: Car,
}

export default function DemoLauncherClient({ demoDisplay }: Props) {
  const [active, setActive] = useState<SalesIndustrySlug | null>(null)
  const [loading, setLoading] = useState<SalesIndustrySlug | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function load(slug: SalesIndustrySlug) {
    setLoading(slug); setError(null)
    const res = await fetch('/api/sales/launch-demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ industry: slug }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.ok) {
      setError(body?.error ?? 'Could not load demo.')
      setLoading(null)
      return
    }
    setActive(slug)
    setLoading(null)
  }

  async function copyNumber() {
    if (!demoDisplay) return
    try {
      await navigator.clipboard.writeText(demoDisplay.replace(/\s+/g, ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // best-effort
    }
  }

  const activePoints = active ? DEMO_TALKING_POINTS[active] : null

  return (
    <div style={{ padding: '24px 24px 60px', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Demo Launcher</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, marginTop: 4 }}>
          Pick an industry. Load the right demo agent onto your number, then call it from your phone in front of the prospect.
        </p>
      </div>

      <div style={{
        background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12, padding: 18, marginBottom: 22,
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 9, flexShrink: 0,
          background: 'rgba(232,98,42,0.15)', color: '#E8622A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Phone size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: '#7BAED4', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Demo Phone Number
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: 1, marginTop: 2 }}>
            {demoDisplay || 'Not configured'}
          </div>
        </div>
        {demoDisplay && (
          <button
            onClick={copyNumber}
            style={{
              padding: '10px 14px', borderRadius: 9, cursor: 'pointer',
              background: copied ? '#22c55e' : 'rgba(232,98,42,0.12)',
              color: copied ? 'white' : '#E8622A',
              border: '1px solid ' + (copied ? '#22c55e' : 'rgba(232,98,42,0.3)'),
              fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy number'}
          </button>
        )}
      </div>

      {error && (
        <div style={{
          marginBottom: 16, padding: '12px 16px', borderRadius: 9,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#ef4444', fontSize: 13,
        }}>{error}</div>
      )}

      <div className="demo-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 12,
        marginBottom: 28,
      }}>
        {SALES_INDUSTRY_SLUGS.map(slug => {
          const Icon = INDUSTRY_ICONS[slug]
          const isActive = active === slug
          const isLoading = loading === slug
          return (
            <div
              key={slug}
              style={{
                background: '#0A1E38',
                border: `1px solid ${isActive ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 11, padding: 16,
                display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: isActive ? 'rgba(34,197,94,0.15)' : 'rgba(232,98,42,0.12)',
                color: isActive ? '#22c55e' : '#E8622A',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={18} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>
                {SALES_INDUSTRY_LABELS[slug]}
              </div>
              {isActive ? (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99,
                  background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                  border: '1px solid rgba(34,197,94,0.35)',
                }}>
                  <Check size={11} /> Active
                </span>
              ) : (
                <button
                  onClick={() => load(slug)}
                  disabled={isLoading}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8, border: 'none',
                    background: isLoading ? '#7B3A1A' : '#E8622A', color: 'white',
                    fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 700,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {isLoading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                  {isLoading ? 'Loading' : 'Load Demo'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {activePoints && active && (
        <div style={{
          background: '#0A1E38', border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 12, padding: 20,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: '#22c55e',
            letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10,
          }}>
            {SALES_INDUSTRY_LABELS[active]} — Prep
          </div>
          <div style={{ fontSize: 13, color: '#7BAED4', marginBottom: 16 }}>
            Number to call: <strong style={{ color: 'white' }}>{demoDisplay}</strong>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'white', marginBottom: 8 }}>Talking points</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#7BAED4', fontSize: 13, lineHeight: 1.7 }}>
              {activePoints.points.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'white', marginBottom: 6 }}>Opener</div>
            <div style={{
              padding: '12px 14px', borderRadius: 9, fontSize: 13, color: '#7BAED4',
              background: '#061322', border: '1px solid rgba(255,255,255,0.08)',
              fontStyle: 'italic', lineHeight: 1.6,
            }}>&ldquo;{activePoints.opener}&rdquo;</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
