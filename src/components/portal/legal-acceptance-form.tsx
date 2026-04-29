'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { ALL_LEGAL_DOCS, type DocumentType, type LegalDoc } from '@/lib/legal-docs'

interface Props {
  // Optional — restrict to specific docs (e.g. when only one needs re-acceptance).
  docs?: LegalDoc[]
  busy?: boolean
  onSubmit: (signature: string, acceptedDocs: DocumentType[]) => Promise<void> | void
  showHeader?: boolean
}

// Standalone T&C form. Used by:
// - the onboarding wizard (Part 1, Part 5)
// - the /accept-terms page (retroactive acceptance for existing clients)
export default function LegalAcceptanceForm({ docs, busy, onSubmit, showHeader = true }: Props) {
  const allDocs = docs ?? ALL_LEGAL_DOCS
  const [accepted, setAccepted] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<string | null>(allDocs[0]?.id ?? null)
  const [signature, setSignature] = useState('')
  const [now, setNow] = useState<string>('')

  useEffect(() => {
    function fmt() {
      try {
        return new Intl.DateTimeFormat('en-AU', {
          dateStyle: 'long', timeStyle: 'short', timeZone: 'Australia/Brisbane',
        }).format(new Date()) + ' AEST'
      } catch { return new Date().toISOString() }
    }
    setNow(fmt())
    const t = setInterval(() => setNow(fmt()), 60_000)
    return () => clearInterval(t)
  }, [])

  const allChecked = allDocs.every(d => accepted[d.id])
  const canSubmit = allChecked && signature.trim().length >= 2 && !busy

  async function handleSubmit() {
    if (!canSubmit) return
    await onSubmit(signature.trim(), allDocs.map(d => d.id))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {showHeader && (
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'white', marginBottom: 6 }}>
            Review and accept our terms
          </h2>
          <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 4 }}>
            Please read and accept the following before activating your TalkMate account.
          </p>
        </div>
      )}

      {allDocs.map(doc => {
        const isOpen = expanded === doc.id
        const isAccepted = accepted[doc.id]
        return (
          <div key={doc.id} style={{
            background: '#071829',
            border: `1px solid ${isAccepted ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 12, overflow: 'hidden',
          }}>
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : doc.id)}
              style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer',
                fontFamily: 'Outfit, sans-serif', textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isAccepted ? '#22C55E' : 'rgba(255,255,255,0.06)',
                }}>
                  {isAccepted && <Check size={13} color="white" />}
                </span>
                <span>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'white' }}>{doc.title}</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#4A7FBB', marginTop: 2 }}>Version {doc.version}</span>
                </span>
              </div>
              {isOpen ? <ChevronUp size={16} color="#7BAED4" /> : <ChevronDown size={16} color="#7BAED4" />}
            </button>

            {isOpen && (
              <div style={{ padding: '0 18px 18px' }}>
                <div style={{
                  background: '#061322', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 9,
                  padding: 16, maxHeight: 280, overflowY: 'auto',
                  fontFamily: '"Outfit", sans-serif', fontSize: 12.5, color: '#7BAED4', lineHeight: 1.75,
                  whiteSpace: 'pre-wrap',
                }}>
                  {doc.body}
                </div>
                <label style={{
                  display: 'flex', alignItems: 'flex-start', gap: 11, cursor: 'pointer',
                  padding: '14px 16px', background: '#061322',
                  border: `1.5px solid ${isAccepted ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 10, marginTop: 12,
                }}>
                  <input
                    type="checkbox"
                    checked={!!isAccepted}
                    onChange={e => setAccepted(s => ({ ...s, [doc.id]: e.target.checked }))}
                    style={{ marginTop: 2, width: 17, height: 17, accentColor: '#22C55E', flexShrink: 0, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 13, color: 'white', lineHeight: 1.55 }}>
                    {doc.acceptanceLabel} <span style={{ color: '#E8622A', fontSize: 11 }}>(Required)</span>
                  </span>
                </label>
              </div>
            )}
          </div>
        )
      })}

      <div style={{
        background: '#071829', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 18,
      }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#4A7FBB', display: 'block', marginBottom: 6 }}>
          Type your full name as your electronic signature
        </label>
        <input
          value={signature}
          onChange={e => setSignature(e.target.value)}
          placeholder="e.g. Pat Smith"
          style={{
            width: '100%', padding: '12px 14px',
            background: '#061322', border: '1px solid rgba(255,255,255,0.1)', color: 'white',
            borderRadius: 10, fontFamily: 'Outfit, sans-serif', fontSize: 15, outline: 'none',
          }}
        />
        <p style={{ fontSize: 11, color: '#4A7FBB', marginTop: 8, lineHeight: 1.55 }}>
          By typing your name you are signing this agreement electronically. This has the same legal effect as a handwritten signature under Australian law.
        </p>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
          marginTop: 12, padding: '10px 12px',
          background: 'rgba(74,159,232,0.06)', border: '1px solid rgba(74,159,232,0.15)',
          borderRadius: 9, fontSize: 12, color: '#7BAED4',
        }}>
          <span>Agreement date</span>
          <span style={{ color: 'white', fontWeight: 600 }}>{now}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{
          width: '100%', padding: '14px 18px', borderRadius: 12,
          background: canSubmit ? '#E8622A' : 'rgba(232,98,42,0.4)',
          color: 'white', border: 'none', fontFamily: 'Outfit, sans-serif',
          fontSize: 15, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed',
        }}
      >
        {busy ? 'Recording acceptance…' : 'Accept and continue →'}
      </button>

      {!allChecked && (
        <p style={{ fontSize: 12, color: '#F59E0B', textAlign: 'center', margin: 0 }}>
          You must accept the Terms of Service, Privacy Policy, and Data Processing Agreement to activate your TalkMate account.
        </p>
      )}
    </div>
  )
}
