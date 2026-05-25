'use client'

// Sessions 36-37 — customer signature capture. Wraps the
// signature_pad library in a touch-friendly canvas. On confirm we
// POST a PNG data URL to /api/driver/jobs/[id]/signature which stores
// it in Storage and stamps dispatch_jobs.<type>_signature_url.

import { useEffect, useRef, useState } from 'react'
import SignaturePadLib from 'signature_pad'

const BRAND = {
  orange: '#E8622A',
  navy: '#061322',
  grey: '#6b7280',
  green: '#22C55E',
}

export interface SignaturePadProps {
  jobId: string
  signatureType: 'pickup' | 'delivery'
  currentUrl: string | null
  onSaved: (url: string) => void
}

export function SignaturePad({ jobId, signatureType, currentUrl, onSaved }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const padRef = useRef<SignaturePadLib | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    // Resize for device pixel ratio so the strokes don't look thin
    // on retina.
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    const ctx = canvas.getContext('2d')
    ctx?.scale(ratio, ratio)
    padRef.current = new SignaturePadLib(canvas, {
      penColor: '#061322',
      backgroundColor: '#ffffff',
      minWidth: 0.8,
      maxWidth: 2.6,
    })
    return () => { padRef.current?.off() }
  }, [])

  function clear() {
    padRef.current?.clear()
  }

  async function confirm() {
    const pad = padRef.current
    if (!pad || pad.isEmpty()) {
      setError('Please draw a signature first')
      return
    }
    setError(null); setSaving(true)
    try {
      const dataUrl = pad.toDataURL('image/png')
      const res = await fetch(`/api/driver/jobs/${jobId}/signature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature_data: dataUrl, signature_type: signatureType }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Save failed')
      onSaved(data.signature_url)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (currentUrl) {
    return (
      <div>
        <div style={{
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          color: '#166534',
          padding: '10px 14px',
          borderRadius: 8,
          fontSize: 13,
          marginBottom: 10,
        }}>
          Signature captured.
        </div>
        <img
          src={currentUrl}
          alt={`${signatureType} signature`}
          style={{
            width: '100%',
            maxHeight: 160,
            objectFit: 'contain',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
          }}
        />
      </div>
    )
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: 200,
          background: '#fff',
          border: '1px solid #d1d5db',
          borderRadius: 8,
          touchAction: 'none',
        }}
      />
      {error && (
        <div style={{
          background: '#fee2e2',
          color: '#991b1b',
          border: '1px solid #fecaca',
          padding: '8px 12px',
          borderRadius: 8,
          fontSize: 13,
          marginTop: 8,
        }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          type="button"
          onClick={clear}
          disabled={saving}
          style={{
            flex: 1,
            padding: '11px 14px',
            background: '#fff',
            color: BRAND.grey,
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={saving}
          style={{
            flex: 1,
            padding: '11px 14px',
            background: BRAND.green,
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            cursor: saving ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Confirm signature'}
        </button>
      </div>
    </div>
  )
}
