'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function ApproveContent() {
  const params = useSearchParams()
  const businessId = params.get('businessId')
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [result, setResult] = useState<{ twilioNumber?: string } | null>(null)
  const [error, setError] = useState('')
  const [biz, setBiz] = useState<{ name: string; business_type: string; preview_number: string } | null>(null)

  useEffect(() => {
    if (!businessId) return
    fetch(`/api/admin/business-preview?businessId=${businessId}`)
      .then(r => r.json())
      .then(d => setBiz(d))
      .catch(() => {})
  }, [businessId])

  async function handleApprove() {
    setState('loading')
    setError('')
    const res = await fetch('/api/admin/approve-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': 'talkmate-admin-2026' },
      body: JSON.stringify({ businessId }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Failed'); setState('error'); return }
    setResult(data)
    setState('success')
  }

  if (!businessId) return <div style={{ color: 'white', padding: 40 }}>No business ID provided.</div>

  return (
    <div style={{ minHeight: '100vh', background: '#061322', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 40, maxWidth: 480, width: '100%' }}>
        <div style={{ marginBottom: 24 }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: 'white' }}>Talk</span>
          <span style={{ fontSize: 16, fontWeight: 300, color: '#4A9FE8', letterSpacing: 4 }}>Mate</span>
          <span style={{ marginLeft: 12, fontSize: 12, fontWeight: 700, color: '#E8622A', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Admin</span>
        </div>

        {state === 'success' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'white', marginBottom: 12 }}>Agent approved & live!</h2>
            {result?.twilioNumber && (
              <div style={{ background: 'rgba(232,98,42,0.15)', border: '1px solid rgba(232,98,42,0.3)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: '#E8622A', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Number Provisioned</p>
                <p style={{ fontSize: 28, fontWeight: 800, color: 'white', margin: 0 }}>{result.twilioNumber}</p>
              </div>
            )}
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>Welcome email sent to client.</p>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'white', marginBottom: 8 }}>Review Agent</h2>
            {biz ? (
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 18, marginBottom: 24 }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 4 }}>{biz.name}</p>
                <p style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 12 }}>{biz.business_type}</p>
                {biz.preview_number && (
                  <>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>PREVIEW NUMBER — CALL THIS FIRST</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: '#4A9FE8' }}>{biz.preview_number}</p>
                  </>
                )}
              </div>
            ) : (
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 18, marginBottom: 24 }}>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading...</p>
              </div>
            )}

            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginBottom: 28 }}>
              Call the preview number above to hear the agent. Happy with how it sounds? Hit approve — this will provision a real AU number and send the welcome email to the client.
            </p>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#ef4444', marginBottom: 16 }}>
                {error}
              </div>
            )}

            <button
              onClick={handleApprove}
              disabled={state === 'loading'}
              style={{ width: '100%', padding: '14px', background: state === 'loading' ? '#555' : '#E8622A', color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: state === 'loading' ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
            >
              {state === 'loading' ? 'Provisioning number…' : '✅ Approve & Go Live'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function ApprovePage() {
  return (
    <Suspense fallback={<div style={{ color: 'white', padding: 40 }}>Loading…</div>}>
      <ApproveContent />
    </Suspense>
  )
}
