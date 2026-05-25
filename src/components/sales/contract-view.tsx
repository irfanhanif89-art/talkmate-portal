'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, FileText, AlertCircle, ExternalLink } from 'lucide-react'
import { formatDateTime } from '@/lib/sales-format'

export interface ContractRow {
  id: string
  document_name: string
  document_path: string
  policy_version: string
  status: 'pending_signature' | 'signed' | 'superseded'
  sent_at: string | null
  signed_at: string | null
  signer_name: string | null
}

interface Props {
  contract: ContractRow | null
  repFullName: string
}

export default function ContractView({ contract, repFullName }: Props) {
  const router = useRouter()
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  // iframe PDF embedding is silently broken on iOS Safari — it renders
  // a blank white box. On mobile we hide the iframe entirely and show
  // a prominent "Open contract PDF" button instead.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!contract) return
    setLoadingUrl(true)
    fetch('/api/sales/storage/contract-url')
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.url) setSignedUrl(json.url) })
      .catch(() => { /* silent — UI shows fallback */ })
      .finally(() => setLoadingUrl(false))
  }, [contract])

  async function sign() {
    if (!typedName.trim()) { setError('Type your full name to confirm your signature.'); return }
    setSigning(true); setError(null)
    const res = await fetch('/api/sales/sign-contract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signer_name: typedName.trim() }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.error ?? 'Could not save signature. Please try again.')
      setSigning(false)
      return
    }
    router.refresh()
  }

  if (!contract) {
    return (
      <div style={{
        padding: 36, borderRadius: 12,
        background: '#0A1E38', border: '1px dashed rgba(255,255,255,0.1)',
        textAlign: 'center',
      }}>
        <FileText size={36} color="#7BAED4" style={{ marginBottom: 12 }} />
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'white', margin: 0, marginBottom: 8 }}>
          No contract on file yet
        </h2>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, lineHeight: 1.6 }}>
          Your manager will upload your Independent Sales Representative Agreement shortly. You'll get an email when it's ready to sign.
        </p>
      </div>
    )
  }

  return (
    <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: '#7BAED4', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Document</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{contract.document_name}</div>
        </div>
        <div>
          {contract.status === 'signed' ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 99,
              background: 'rgba(34,197,94,0.15)', color: '#22c55e',
              border: '1px solid rgba(34,197,94,0.35)', fontSize: 12, fontWeight: 700,
            }}>
              <CheckCircle2 size={13} /> Signed {formatDateTime(contract.signed_at)}
            </span>
          ) : (
            <span style={{
              display: 'inline-block', padding: '5px 12px', borderRadius: 99,
              background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
              border: '1px solid rgba(245,158,11,0.35)', fontSize: 12, fontWeight: 700,
            }}>Pending signature</span>
          )}
        </div>
      </div>

      {/* PDF embed */}
      <div style={{ padding: 22 }}>
        {loadingUrl ? (
          <div style={{ height: 540, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7BAED4', fontSize: 13, background: '#061322', borderRadius: 9 }}>
            Loading document…
          </div>
        ) : signedUrl ? (
          isMobile ? (
            // iOS Safari renders <iframe src=…pdf> as a blank white
            // box. Show a prominent button instead so reps can open
            // the contract in the native PDF viewer.
            <a
              href={signedUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                width: '100%', boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '18px 22px', borderRadius: 10, border: 'none',
                background: '#E8622A', color: 'white', textDecoration: 'none',
                fontFamily: 'Outfit, sans-serif', fontSize: 15, fontWeight: 700,
              }}
            >
              <ExternalLink size={18} /> Open contract PDF
            </a>
          ) : (
            <iframe
              src={signedUrl}
              title={contract.document_name}
              style={{ width: '100%', height: 620, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, background: 'white' }}
            />
          )
        ) : (
          <div style={{ padding: 28, color: '#ef4444', fontSize: 13, background: 'rgba(239,68,68,0.08)', borderRadius: 9, textAlign: 'center' }}>
            Could not load the document. Try refreshing, or contact admin if this keeps happening.
          </div>
        )}

        {signedUrl && !isMobile && (
          <div style={{ marginTop: 10, textAlign: 'right' }}>
            <a href={signedUrl} target="_blank" rel="noreferrer"
               style={{ fontSize: 12, color: '#4A9FE8', textDecoration: 'none' }}>
              Open in new tab →
            </a>
          </div>
        )}
      </div>

      {/* Sign block */}
      {contract.status === 'pending_signature' && (
        <div style={{ padding: '22px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: 'white', margin: 0, marginBottom: 6 }}>Sign your agreement</h3>
          <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, marginBottom: 14, lineHeight: 1.6 }}>
            Type your full name exactly as it appears on your account ({repFullName}) to confirm your signature. We keep a date-stamped record so you have proof of what you signed.
          </p>
          <input
            value={typedName}
            onChange={e => setTypedName(e.target.value)}
            placeholder={repFullName}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 10,
              background: '#061322', border: '1px solid rgba(255,255,255,0.1)',
              color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 16, outline: 'none',
              marginBottom: 12,
            }}
          />
          {error && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12, color: '#ef4444', fontSize: 13, padding: '10px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}
          <button
            onClick={sign}
            disabled={signing || !typedName.trim()}
            style={{
              padding: '13px 22px', borderRadius: 10, border: 'none',
              background: signing || !typedName.trim() ? '#7B3A1A' : '#E8622A',
              color: 'white', fontFamily: 'Outfit, sans-serif',
              fontSize: 14, fontWeight: 700,
              cursor: signing || !typedName.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {signing ? 'Saving signature…' : 'Sign Agreement'}
          </button>
        </div>
      )}

      {contract.status === 'signed' && (
        <div style={{ padding: '18px 22px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(34,197,94,0.04)', fontSize: 13, color: '#7BAED4' }}>
          You signed this agreement on <strong style={{ color: 'white' }}>{formatDateTime(contract.signed_at)}</strong> as
          {' '}<strong style={{ color: 'white' }}>{contract.signer_name}</strong>. A copy has been emailed to you.
        </div>
      )}
    </div>
  )
}
