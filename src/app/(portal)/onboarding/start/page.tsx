'use client'

// Session 4A (Round 1) — pre-wizard "review not fill" onboarding flow.
// Stages: chooser -> review (Step 0B) -> identity -> integration -> done.
// This sits BEFORE the existing 12-step wizard at /onboarding and never
// modifies it. It writes confirmed data via /api/onboarding/apply, then hands
// off to /onboarding (or the dashboard).
// Round 1: saving identity/voice does NOT PATCH Vapi.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ONBOARDING_VOICES } from '@/lib/onboarding-intel'
import { Search, Mic, Edit3, Check, X, ChevronRight } from 'lucide-react'

type Stage = 'chooser' | 'review' | 'identity' | 'integration' | 'done'

interface KbSuggestion { category: string; question: string; answer: string }
interface AutoResult {
  businessName: string | null
  phone: string | null
  address: string | null
  industry: string
  ownerName: string | null
  websiteUrl: string | null
  hours: string | null
  suggestedKbEntries: KbSuggestion[]
  confidence: 'high' | 'medium' | 'low'
  source: { googleMaps: boolean; website: boolean }
}

const ORANGE = '#E8622A'
const panel: React.CSSProperties = { background: '#0B1F35', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }
const inp: React.CSSProperties = { background: '#071829', border: '1px solid rgba(255,255,255,0.12)', color: 'white', borderRadius: 10, padding: '11px 14px', width: '100%', fontFamily: 'Outfit,sans-serif', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
const lbl: React.CSSProperties = { fontSize: 12, color: '#4A7FBB', fontWeight: 600, display: 'block', marginBottom: 6 }
const btnPrimary = (disabled = false): React.CSSProperties => ({ background: disabled ? 'rgba(232,98,42,0.35)' : ORANGE, color: 'white', border: 'none', borderRadius: 10, padding: '12px 20px', fontWeight: 700, fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'Outfit,sans-serif' })
const btnGhost: React.CSSProperties = { background: 'transparent', color: '#4A7FBB', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '12px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }

const CONF_COPY: Record<string, string> = {
  high: 'We found your business on Google and read your website.',
  medium: 'We found your business on Google. Add your website for more detail.',
  low: 'We found some details. Fill in the gaps below.',
}

export default function OnboardingStartPage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('chooser')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [result, setResult] = useState<AutoResult | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [accepted, setAccepted] = useState<Record<number, boolean>>({})

  const [agentName, setAgentName] = useState('')
  const [voiceId, setVoiceId] = useState<string>(ONBOARDING_VOICES[0].id)

  const [mode, setMode] = useState<'overflow' | 'after_hours' | 'full_time' | ''>('')
  const [ringDelay, setRingDelay] = useState(3)
  const [carrier, setCarrier] = useState('other')

  const acceptedCount = Object.values(accepted).filter(Boolean).length

  async function runAutoPopulate() {
    if (!input.trim()) return
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/onboarding/auto-populate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: input.trim() }) })
      if (!res.ok) throw new Error('lookup failed')
      const data = await res.json() as AutoResult
      setResult(data)
      setFields({
        name: data.businessName ?? '', phone: data.phone ?? '', industry: data.industry ?? 'other',
        owner_name: data.ownerName ?? '', address: data.address ?? '', hours: data.hours ?? '',
      })
      // Pre-accept all suggestions so the owner only has to deselect.
      const init: Record<number, boolean> = {}
      data.suggestedKbEntries.forEach((_, i) => { init[i] = true })
      setAccepted(init)
      setStage('review')
    } catch {
      setError("We couldn't find your business automatically. You can set up manually instead.")
    } finally {
      setLoading(false)
    }
  }

  async function applyReview() {
    if (!result || acceptedCount < 5) return
    setLoading(true); setError(null)
    try {
      const acceptedKb = result.suggestedKbEntries.filter((_, i) => accepted[i])
      await fetch('/api/onboarding/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessFields: {
            name: fields.name, phone: fields.phone, industry: fields.industry, owner_name: fields.owner_name,
            onboarding_auto_populated: true, onboarding_source_url: result.websiteUrl ?? undefined,
          },
          acceptedKb,
        }),
      })
      setAgentName('')
      setStage('identity')
    } catch {
      setError('Could not save. Please try again.')
    } finally { setLoading(false) }
  }

  async function applyIdentity() {
    setLoading(true); setError(null)
    try {
      await fetch('/api/onboarding/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessFields: { agent_name: agentName.trim() || 'TalkMate', agent_voice_id: voiceId }, markAgentNamed: !!agentName.trim() }),
      })
      setStage('integration')
    } catch { setError('Could not save. Please try again.') } finally { setLoading(false) }
  }

  async function applyIntegration() {
    if (!mode) return
    setLoading(true); setError(null)
    try {
      await fetch('/api/onboarding/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessFields: { integration_mode: mode, integration_ring_delay: mode === 'overflow' ? ringDelay : undefined, carrier }, markModeSelected: true }),
      })
      setStage('done')
    } catch { setError('Could not save. Please try again.') } finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '28px 16px', fontFamily: 'Outfit,sans-serif', color: 'white' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px' }}>Let&apos;s set up your TalkMate agent</h1>
      <p style={{ color: '#4A7FBB', margin: '0 0 22px', fontSize: 14 }}>This takes about 5 minutes. We&apos;ll do the heavy lifting.</p>

      {error && <div style={{ ...panel, borderColor: 'rgba(232,98,42,0.4)', marginBottom: 16, color: '#ffb59a' }}>{error}</div>}

      {/* ── CHOOSER ── */}
      {stage === 'chooser' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={panel}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}><Search size={18} color={ORANGE} /><strong style={{ fontSize: 16 }}>Find my business online</strong></div>
            <p style={{ color: '#9fb6d1', fontSize: 13, margin: '0 0 12px' }}>Paste your website, Google Maps link, or just type your business name and suburb.</p>
            <input style={inp} value={input} onChange={e => setInput(e.target.value)} placeholder="e.g. Joe's Plumbing Parramatta or paste a URL" onKeyDown={e => { if (e.key === 'Enter') runAutoPopulate() }} />
            <button style={{ ...btnPrimary(loading || !input.trim()), marginTop: 12 }} disabled={loading || !input.trim()} onClick={runAutoPopulate}>{loading ? 'Finding your business...' : 'Find my business'}</button>
          </div>

          <div style={{ ...panel, opacity: 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}><Mic size={18} color="#4A7FBB" /><strong style={{ fontSize: 16 }}>Talk to our setup assistant</strong><span style={{ marginLeft: 'auto', fontSize: 11, background: 'rgba(255,255,255,0.08)', padding: '3px 8px', borderRadius: 20, color: '#9fb6d1' }}>Coming soon</span></div>
            <p style={{ color: '#9fb6d1', fontSize: 13, margin: 0 }}>Answer a few questions by voice or chat. We&apos;re putting the finishing touches on this.</p>
          </div>

          <div style={panel}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}><Edit3 size={18} color="#4A7FBB" /><strong style={{ fontSize: 16 }}>Set up manually</strong></div>
            <p style={{ color: '#9fb6d1', fontSize: 13, margin: '0 0 12px' }}>Fill in your details yourself. Full control over every setting.</p>
            <button style={btnGhost} onClick={() => router.push('/onboarding')}>Start manually</button>
          </div>
        </div>
      )}

      {/* ── REVIEW (Step 0B) ── */}
      {stage === 'review' && result && (
        <div>
          <div style={{ ...panel, marginBottom: 14, borderColor: 'rgba(232,98,42,0.3)' }}>
            <strong style={{ fontSize: 14 }}>{CONF_COPY[result.confidence]}</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
            <div style={panel}>
              <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>We found this for your business</h3>
              {[['name', 'Business name'], ['owner_name', 'Owner name'], ['phone', 'Phone'], ['industry', 'Industry'], ['address', 'Location'], ['hours', 'Hours']].map(([key, label]) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <label style={lbl}>{label}</label>
                  <input style={inp} value={fields[key] ?? ''} onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div style={panel}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>Suggested knowledge ({result.suggestedKbEntries.length} found)</h3>
                <button style={{ ...btnGhost, marginLeft: 'auto', padding: '6px 12px' }} onClick={() => { const all: Record<number, boolean> = {}; result.suggestedKbEntries.forEach((_, i) => all[i] = true); setAccepted(all) }}>Accept all</button>
              </div>
              <div style={{ fontSize: 12, color: acceptedCount >= 5 ? '#5fd38a' : '#ffb59a', marginBottom: 10 }}>{acceptedCount} of {result.suggestedKbEntries.length} accepted{acceptedCount < 5 ? ` (need at least 5)` : ''}</div>
              <div style={{ display: 'grid', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                {result.suggestedKbEntries.map((s, i) => (
                  <div key={i} style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 12, opacity: accepted[i] ? 1 : 0.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, textTransform: 'uppercase', background: 'rgba(74,127,187,0.2)', color: '#7fb0e6', padding: '2px 7px', borderRadius: 6, fontWeight: 700 }}>{s.category}</span>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button aria-label="accept" onClick={() => setAccepted(a => ({ ...a, [i]: true }))} style={{ background: accepted[i] ? '#1f7a44' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6, padding: 5, cursor: 'pointer' }}><Check size={14} color="white" /></button>
                        <button aria-label="skip" onClick={() => setAccepted(a => ({ ...a, [i]: false }))} style={{ background: !accepted[i] ? '#7a1f1f' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 6, padding: 5, cursor: 'pointer' }}><X size={14} color="white" /></button>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{s.question}</div>
                    <div style={{ fontSize: 12, color: '#9fb6d1', marginTop: 2 }}>{s.answer}</div>
                  </div>
                ))}
                {result.suggestedKbEntries.length === 0 && <div style={{ color: '#9fb6d1', fontSize: 13 }}>No suggestions found. You can add knowledge later in Train TalkMate.</div>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button style={btnGhost} onClick={() => setStage('chooser')}>Back</button>
            <button style={btnPrimary(loading || acceptedCount < 5)} disabled={loading || acceptedCount < 5} onClick={applyReview}>{loading ? 'Saving...' : 'Looks good, continue'}</button>
          </div>
        </div>
      )}

      {/* ── IDENTITY ── */}
      {stage === 'identity' && (
        <div style={panel}>
          <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>Name your assistant</h3>
          <p style={{ color: '#9fb6d1', fontSize: 13, margin: '0 0 16px' }}>Give your TalkMate agent a name. Your customers will hear this name when they call.</p>
          <label style={lbl}>Your assistant&apos;s name</label>
          <input style={inp} value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="e.g. Sarah, Emma, Alex" />
          <p style={{ fontSize: 12, color: '#6b86a6', margin: '6px 0 18px' }}>Choose a name that feels natural for your business.</p>
          <label style={lbl}>Pick a voice</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginTop: 6 }}>
            {ONBOARDING_VOICES.map(v => (
              <button key={v.id} onClick={() => setVoiceId(v.id)} style={{ textAlign: 'left', background: '#071829', border: `1px solid ${voiceId === v.id ? ORANGE : 'rgba(255,255,255,0.1)'}`, borderRadius: 10, padding: 12, cursor: 'pointer', color: 'white' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}><strong style={{ fontSize: 14 }}>{v.label}</strong>{voiceId === v.id && <Check size={15} color={ORANGE} style={{ marginLeft: 'auto' }} />}</div>
                <div style={{ fontSize: 11, color: '#9fb6d1', marginTop: 2 }}>{v.blurb}</div>
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: '#6b86a6', margin: '12px 0 0' }}>You&apos;ll hear your chosen voice live when you call your number.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button style={btnPrimary(loading)} disabled={loading} onClick={applyIdentity}>{loading ? 'Saving...' : 'Continue'}</button>
          </div>
        </div>
      )}

      {/* ── INTEGRATION ── */}
      {stage === 'integration' && (
        <div style={panel}>
          <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>How should TalkMate answer your calls?</h3>
          <p style={{ color: '#9fb6d1', fontSize: 13, margin: '0 0 16px' }}>Choose how you want TalkMate to work with your existing phone setup.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {([
              ['overflow', 'Overflow, catch what you miss', 'Your phone rings as normal. TalkMate only answers if you don\'t pick up after a set number of rings.'],
              ['after_hours', 'After hours, cover when you\'re off', 'TalkMate answers calls outside your business hours and on weekends. During business hours, your phone rings as normal.'],
              ['full_time', 'Full time, never miss a call', 'TalkMate answers every call immediately, even while you\'re on another call.'],
            ] as const).map(([k, title, body]) => (
              <button key={k} onClick={() => setMode(k)} style={{ textAlign: 'left', background: '#071829', border: `1px solid ${mode === k ? ORANGE : 'rgba(255,255,255,0.1)'}`, borderRadius: 10, padding: 14, cursor: 'pointer', color: 'white' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}><strong style={{ fontSize: 14 }}>{title}</strong>{mode === k && <Check size={15} color={ORANGE} style={{ marginLeft: 'auto' }} />}</div>
                <div style={{ fontSize: 12, color: '#9fb6d1', marginTop: 4 }}>{body}</div>
                {k === 'overflow' && mode === 'overflow' && (
                  <div style={{ marginTop: 10 }} onClick={e => e.stopPropagation()}>
                    <label style={lbl}>Ring delay before TalkMate answers</label>
                    <select style={{ ...inp, width: 160 }} value={ringDelay} onChange={e => setRingDelay(Number(e.target.value))}>
                      {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n} rings</option>)}
                    </select>
                  </div>
                )}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={lbl}>Your mobile carrier</label>
            <select style={{ ...inp, width: 220 }} value={carrier} onChange={e => setCarrier(e.target.value)}>
              <option value="telstra">Telstra</option><option value="optus">Optus</option><option value="vodafone">Vodafone</option><option value="other">Other</option>
            </select>
          </div>
          <div style={{ background: 'rgba(232,98,42,0.1)', border: '1px solid rgba(232,98,42,0.3)', borderRadius: 10, padding: 12, marginTop: 14, fontSize: 12, color: '#ffceb8' }}>
            To activate your chosen mode you&apos;ll need to update your call forwarding settings on your phone. We&apos;ll give you the exact steps after go-live. TalkMate never changes your phone settings for you.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button style={btnPrimary(loading || !mode)} disabled={loading || !mode} onClick={applyIntegration}>{loading ? 'Saving...' : 'Continue'}</button>
          </div>
        </div>
      )}

      {/* ── DONE ── */}
      {stage === 'done' && (
        <div style={panel}>
          <h3 style={{ margin: '0 0 6px', fontSize: 20 }}>Great start. Your agent is taking shape.</h3>
          <p style={{ color: '#9fb6d1', fontSize: 14, margin: '0 0 18px' }}>We&apos;ve saved your details and knowledge base. Finish the remaining steps to go live.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            <button style={btnPrimary()} onClick={() => router.push('/onboarding')}>Continue full setup <ChevronRight size={15} style={{ verticalAlign: 'middle' }} /></button>
            <button style={btnGhost} onClick={() => router.push('/onboarding/announcement')}>Notify your customers first</button>
            <button style={btnGhost} onClick={() => router.push('/train')}>Review my knowledge base</button>
          </div>
        </div>
      )}
    </div>
  )
}
