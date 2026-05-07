'use client'

import { useState } from 'react'

// ── Divert Instructions ───────────────────────────────────────────────────────
// Step-by-step call divert setup guide for iPhone, Android, and landline.
// Pass the TalkMate agent number to pre-fill the instructions.

interface Props {
  agentNumber?: string  // e.g. "+61 3 9999 0000" — pre-fills the instructions
}

type DeviceTab = 'iphone' | 'android' | 'landline'

const tabLabels: { key: DeviceTab; icon: string; label: string }[] = [
  { key: 'iphone', icon: '🍎', label: 'iPhone' },
  { key: 'android', icon: '🤖', label: 'Android' },
  { key: 'landline', icon: '☎️', label: 'Landline' },
]

const stepStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  marginBottom: 14,
  alignItems: 'flex-start',
}

const numStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  background: '#E8622A',
  color: 'white',
  fontSize: 12,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  marginTop: 1,
}

const stepText: React.CSSProperties = {
  fontSize: 13,
  color: '#c8daea',
  lineHeight: 1.6,
}

const codeStyle: React.CSSProperties = {
  display: 'inline-block',
  background: '#071829',
  border: '1px solid rgba(232,98,42,0.3)',
  borderRadius: 6,
  padding: '2px 10px',
  fontFamily: 'monospace',
  fontSize: 13,
  color: '#E8622A',
  fontWeight: 700,
  letterSpacing: '0.03em',
}

const tipBox: React.CSSProperties = {
  marginTop: 16,
  padding: '10px 14px',
  background: 'rgba(34,197,94,0.07)',
  border: '1px solid rgba(34,197,94,0.2)',
  borderRadius: 9,
  fontSize: 12,
  color: '#86efac',
  lineHeight: 1.6,
}

const warnBox: React.CSSProperties = {
  marginTop: 12,
  padding: '10px 14px',
  background: 'rgba(251,191,36,0.07)',
  border: '1px solid rgba(251,191,36,0.2)',
  borderRadius: 9,
  fontSize: 12,
  color: '#fcd34d',
  lineHeight: 1.6,
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={stepStyle}>
      <div style={numStyle}>{n}</div>
      <div style={stepText}>{children}</div>
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <span style={codeStyle}>{children}</span>
}

function IPhoneInstructions({ number }: { number: string }) {
  return (
    <div>
      <p style={{ fontSize: 13, color: '#7BAED4', marginTop: 0, marginBottom: 16 }}>
        There are two ways to set up call divert on iPhone — through Settings, or by dialling a short code.
      </p>

      <div style={{ fontSize: 12, fontWeight: 700, color: '#4A9FE8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        Option A — Through Settings (recommended)
      </div>
      <Step n={1}>Open the <strong style={{ color: 'white' }}>Settings</strong> app on your iPhone.</Step>
      <Step n={2}>Scroll down and tap <strong style={{ color: 'white' }}>Phone</strong>.</Step>
      <Step n={3}>Tap <strong style={{ color: 'white' }}>Call Forwarding</strong>.</Step>
      <Step n={4}>Toggle <strong style={{ color: 'white' }}>Call Forwarding</strong> ON (it turns green).</Step>
      <Step n={5}>Tap <strong style={{ color: 'white' }}>Forward To</strong> and enter your TalkMate number: <Code>{number}</Code></Step>
      <Step n={6}>Press the back arrow. A small phone icon will appear in your status bar confirming divert is active.</Step>

      <div style={{ ...tipBox, marginTop: 14 }}>
        ✅ <strong>Recommended:</strong> This sets "Divert All Calls." For best results, ask your carrier to switch to "Divert on No Answer" so your phone rings first — see Option B below.
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: '#4A9FE8', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 20, marginBottom: 10 }}>
        Option B — Divert on No Answer (dial code)
      </div>
      <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 12 }}>
        This makes your phone ring first. If you don't answer within ~15 seconds, TalkMate picks up.
      </p>
      <Step n={1}>Open your <strong style={{ color: 'white' }}>Phone</strong> app and go to the keypad.</Step>
      <Step n={2}>Dial this code exactly (replacing the number if different): <Code>*61*{number.replace(/\s/g, '')}*11*20#</Code></Step>
      <Step n={3}>Press the green <strong style={{ color: 'white' }}>Call</strong> button. You&apos;ll hear a confirmation tone or see a message.</Step>
      <Step n={4}>That&apos;s it — your phone will now ring first, then forward to TalkMate after 20 seconds.</Step>

      <div style={tipBox}>
        ✅ To <strong>turn off</strong> divert on no answer, dial: <Code>##61#</Code> and press Call.
      </div>

      <div style={warnBox}>
        ⚠️ To turn off <strong>all call forwarding</strong>, dial <Code>##002#</Code> and press Call.
      </div>
    </div>
  )
}

function AndroidInstructions({ number }: { number: string }) {
  return (
    <div>
      <p style={{ fontSize: 13, color: '#7BAED4', marginTop: 0, marginBottom: 14 }}>
        Android settings vary slightly by brand (Samsung, Google Pixel, etc.) but the steps are similar.
      </p>

      <div style={{ fontSize: 12, fontWeight: 700, color: '#4A9FE8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        Option A — Through Phone Settings
      </div>
      <Step n={1}>Open the <strong style={{ color: 'white' }}>Phone</strong> app.</Step>
      <Step n={2}>Tap the <strong style={{ color: 'white' }}>three dots (⋮)</strong> or <strong style={{ color: 'white' }}>Settings</strong> (usually top-right).</Step>
      <Step n={3}>Tap <strong style={{ color: 'white' }}>Call Settings</strong> or <strong style={{ color: 'white' }}>Supplementary Services</strong>.</Step>
      <Step n={4}>Tap <strong style={{ color: 'white' }}>Call Forwarding</strong>.</Step>
      <Step n={5}>
        Choose your divert type:
        <ul style={{ marginTop: 6, marginBottom: 0, paddingLeft: 18 }}>
          <li><strong style={{ color: 'white' }}>Always forward</strong> — all calls go straight to TalkMate</li>
          <li><strong style={{ color: 'white' }}>Forward when unanswered</strong> ✅ (recommended) — your phone rings first</li>
          <li><strong style={{ color: 'white' }}>Forward when busy</strong> — forwards if you're already on a call</li>
        </ul>
      </Step>
      <Step n={6}>Enter your TalkMate number: <Code>{number}</Code> and tap <strong style={{ color: 'white' }}>Turn On</strong> or <strong style={{ color: 'white' }}>Enable</strong>.</Step>

      <div style={{ fontSize: 12, fontWeight: 700, color: '#4A9FE8', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 20, marginBottom: 10 }}>
        Option B — Divert on No Answer (dial code)
      </div>
      <Step n={1}>Open the <strong style={{ color: 'white' }}>Phone</strong> app and go to the keypad.</Step>
      <Step n={2}>Dial: <Code>*61*{number.replace(/\s/g, '')}*11*20#</Code></Step>
      <Step n={3}>Press <strong style={{ color: 'white' }}>Call</strong>. You&apos;ll get a confirmation.</Step>
      <Step n={4}>Your phone now rings first, then TalkMate picks up after 20 seconds.</Step>

      <div style={tipBox}>
        ✅ To <strong>turn off</strong> divert on no answer: dial <Code>##61#</Code> and press Call.<br />
        To turn off <strong>all forwarding</strong>: dial <Code>##002#</Code> and press Call.
      </div>

      <div style={warnBox}>
        ⚠️ <strong>Samsung users:</strong> Settings may be under <em>Phone app → More options → Settings → Supplementary services → Call forwarding</em>.
      </div>
    </div>
  )
}

function LandlineInstructions({ number }: { number: string }) {
  return (
    <div>
      <p style={{ fontSize: 13, color: '#7BAED4', marginTop: 0, marginBottom: 14 }}>
        Landline call divert is controlled with short dial codes from your handset. These work on most Australian landlines (Telstra, Optus, TPG, etc.).
      </p>

      <div style={{ fontSize: 12, fontWeight: 700, color: '#4A9FE8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        Divert All Calls (unconditional)
      </div>
      <Step n={1}>Pick up your handset and wait for dial tone.</Step>
      <Step n={2}>Dial: <Code>*21*{number.replace(/\s/g, '')}#</Code></Step>
      <Step n={3}>Wait for a confirmation tone or announcement, then hang up.</Step>
      <Step n={4}>All calls to your landline now go straight to TalkMate.</Step>

      <div style={{ fontSize: 12, fontWeight: 700, color: '#4A9FE8', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 20, marginBottom: 10 }}>
        Divert on No Answer ✅ (recommended)
      </div>
      <Step n={1}>Pick up the handset.</Step>
      <Step n={2}>Dial: <Code>*61*{number.replace(/\s/g, '')}#</Code></Step>
      <Step n={3}>Wait for confirmation tone, then hang up.</Step>
      <Step n={4}>Your phone now rings first. If not answered, TalkMate picks up.</Step>

      <div style={{ fontSize: 12, fontWeight: 700, color: '#4A9FE8', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 20, marginBottom: 10 }}>
        Divert When Busy
      </div>
      <Step n={1}>Pick up the handset.</Step>
      <Step n={2}>Dial: <Code>*67*{number.replace(/\s/g, '')}#</Code></Step>
      <Step n={3}>Wait for confirmation, then hang up.</Step>

      <div style={tipBox}>
        ✅ To <strong>cancel all diverts</strong>, dial <Code>##002#</Code> from your handset and wait for the confirmation tone.
      </div>

      <div style={warnBox}>
        ⚠️ <strong>VoIP / NBN landlines</strong> (e.g. Aussie Broadband, Aussie BB, Superloop) — these codes may not work. Log into your provider&apos;s online portal or call their support line to set up call forwarding.
        <br /><br />
        ⚠️ <strong>Business phone systems (PABX):</strong> Divert settings are usually in the handset menu or controlled by your IT provider. Ask them to forward your main number to: <Code>{number}</Code>
      </div>
    </div>
  )
}

export default function DivertInstructions({ agentNumber }: Props) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<DeviceTab>('iphone')
  const number = agentNumber || '[Your TalkMate number]'

  return (
    <div style={{ marginTop: 14 }}>
      {/* Collapsible trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '11px 14px',
          background: 'rgba(74,159,232,0.07)',
          border: '1px solid rgba(74,159,232,0.2)',
          borderRadius: open ? '10px 10px 0 0' : 10,
          color: '#4A9FE8',
          fontFamily: 'Outfit, sans-serif',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span>📖 How to set up call divert — step by step instructions</span>
        <span style={{ fontSize: 16 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          border: '1px solid rgba(74,159,232,0.2)',
          borderTop: 'none',
          borderRadius: '0 0 10px 10px',
          padding: '18px 16px',
          background: '#071829',
        }}>
          {/* Device tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
            {tabLabels.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                style={{
                  flex: 1,
                  padding: '9px 6px',
                  borderRadius: 8,
                  border: `1.5px solid ${tab === t.key ? '#E8622A' : 'rgba(255,255,255,0.08)'}`,
                  background: tab === t.key ? 'rgba(232,98,42,0.1)' : 'transparent',
                  color: tab === t.key ? '#E8622A' : '#7BAED4',
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: 13,
                  fontWeight: tab === t.key ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Instructions */}
          {tab === 'iphone' && <IPhoneInstructions number={number} />}
          {tab === 'android' && <AndroidInstructions number={number} />}
          {tab === 'landline' && <LandlineInstructions number={number} />}
        </div>
      )}
    </div>
  )
}
