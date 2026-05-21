'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Captures an electronic signature in one of two modes:
//
//   draw : freehand stroke on an HTML5 canvas, mouse + touch supported.
//   type : user types their full legal name, rendered in a cursive
//          script font (Dancing Script via Google Fonts) and rasterised
//          to PNG so the output shape is identical to the draw mode.
//
// Both modes emit a PNG data URL via `onSignatureChange`, or `null`
// if the signature is empty. Whichever mode the user submits with is
// reported through `onMethodChange` so the API route can record it
// alongside the agreement.
//
// Background is the same dark navy used by the onboarding flow so the
// captured PNG composites onto white in the generated PDF cleanly via
// transparent canvas + dark ink.

export type SignatureMethod = 'drawn' | 'typed'

interface SignatureCaptureProps {
  signerName: string
  onSignatureChange: (signatureDataUrl: string | null) => void
  onMethodChange?: (method: SignatureMethod) => void
}

const CANVAS_WIDTH = 500
const CANVAS_HEIGHT = 150
const TYPED_FONT_FAMILY = '"Dancing Script", "Brush Script MT", cursive'
const STROKE_COLOR = '#FFFFFF'
const BG_COLOR = '#061322'

export default function SignatureCapture({
  signerName, onSignatureChange, onMethodChange,
}: SignatureCaptureProps) {
  const [mode, setMode] = useState<SignatureMethod>('drawn')
  const [typed, setTyped] = useState('')
  const [fontReady, setFontReady] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const typedCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPosRef = useRef<{ x: number; y: number } | null>(null)
  const hasInkRef = useRef(false)

  // Load Dancing Script via Google Fonts <link> exactly once. We
  // wait on document.fonts.load() so the typed-mode raster sees the
  // real cursive face, not a fallback.
  useEffect(() => {
    const HREF = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap'
    if (!document.querySelector(`link[data-signature-font="1"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = HREF
      link.setAttribute('data-signature-font', '1')
      document.head.appendChild(link)
    }
    let cancelled = false
    document.fonts.load('48px "Dancing Script"').then(() => {
      if (!cancelled) setFontReady(true)
    }).catch(() => {
      if (!cancelled) setFontReady(true) // fall through to system cursive
    })
    return () => { cancelled = true }
  }, [])

  // ---------------------------------------------------------------
  // Draw mode
  // ---------------------------------------------------------------
  const clearDrawn = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, c.width, c.height)
    hasInkRef.current = false
    onSignatureChange(null)
  }, [onSignatureChange])

  useEffect(() => {
    if (mode !== 'drawn') return
    clearDrawn()
  }, [mode, clearDrawn])

  const getPos = (e: PointerEvent | React.PointerEvent): { x: number; y: number } | null => {
    const c = canvasRef.current
    if (!c) return null
    const rect = c.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * c.width,
      y: ((e.clientY - rect.top) / rect.height) * c.height,
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const pos = getPos(e)
    if (!pos) return
    drawingRef.current = true
    lastPosRef.current = pos
    canvasRef.current?.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const pos = getPos(e)
    const last = lastPosRef.current
    if (!pos || !last) return
    ctx.strokeStyle = STROKE_COLOR
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPosRef.current = pos
    hasInkRef.current = true
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    drawingRef.current = false
    lastPosRef.current = null
    canvasRef.current?.releasePointerCapture(e.pointerId)
    if (hasInkRef.current) {
      const dataUrl = canvasRef.current?.toDataURL('image/png') ?? null
      onSignatureChange(dataUrl)
    } else {
      onSignatureChange(null)
    }
  }

  // ---------------------------------------------------------------
  // Type mode
  // ---------------------------------------------------------------
  useEffect(() => {
    if (mode !== 'typed') return
    const c = typedCanvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, c.width, c.height)
    const text = typed.trim()
    if (!text) {
      onSignatureChange(null)
      return
    }
    ctx.fillStyle = STROKE_COLOR
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    // Scale font down if the text is too wide to fit.
    let size = 64
    do {
      ctx.font = `600 ${size}px ${TYPED_FONT_FAMILY}`
      const metrics = ctx.measureText(text)
      if (metrics.width <= c.width - 40) break
      size -= 4
    } while (size > 18)
    ctx.fillText(text, c.width / 2, c.height / 2)
    onSignatureChange(c.toDataURL('image/png'))
  }, [mode, typed, fontReady, onSignatureChange])

  // Notify parent of the active mode so it can stamp the agreement.
  useEffect(() => {
    onMethodChange?.(mode)
  }, [mode, onMethodChange])

  return (
    <div>
      {/* Tabs */}
      <div style={tabRow}>
        <button
          type="button"
          style={mode === 'drawn' ? tabActive : tab}
          onClick={() => setMode('drawn')}
        >Draw</button>
        <button
          type="button"
          style={mode === 'typed' ? tabActive : tab}
          onClick={() => setMode('typed')}
        >Type</button>
      </div>

      {mode === 'drawn' && (
        <>
          <p style={instruction}>Sign using your mouse or finger.</p>
          <div style={canvasWrap}>
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={(e) => { if (drawingRef.current) handlePointerUp(e) }}
              style={{
                width: '100%',
                maxWidth: CANVAS_WIDTH,
                height: 'auto',
                aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
                background: BG_COLOR,
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 8,
                touchAction: 'none',
                cursor: 'crosshair',
                display: 'block',
              }}
            />
          </div>
          <button type="button" style={clearBtn} onClick={clearDrawn}>Clear</button>
        </>
      )}

      {mode === 'typed' && (
        <>
          <p style={instruction}>Type your full legal name.</p>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={signerName || 'Your full legal name'}
            style={textInput}
          />
          <canvas
            ref={typedCanvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            style={{
              width: '100%',
              maxWidth: CANVAS_WIDTH,
              height: 'auto',
              aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
              background: BG_COLOR,
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 8,
              marginTop: 10,
              display: 'block',
            }}
          />
        </>
      )}
    </div>
  )
}

// ---- styles ----
const tabRow: React.CSSProperties = {
  display: 'flex', gap: 6, marginBottom: 12,
  borderBottom: '1px solid rgba(255,255,255,0.1)',
}
const tab: React.CSSProperties = {
  background: 'transparent', color: 'rgba(255,255,255,0.6)',
  border: 'none', padding: '8px 16px', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', borderBottom: '2px solid transparent',
  fontFamily: 'inherit',
}
const tabActive: React.CSSProperties = {
  ...tab,
  color: '#22D3EE',
  borderBottom: '2px solid #22D3EE',
}
const instruction: React.CSSProperties = {
  fontSize: 13, color: 'rgba(255,255,255,0.65)', margin: '0 0 8px',
}
const canvasWrap: React.CSSProperties = {
  // Centers and lets the canvas scale on small screens.
  display: 'block',
}
const clearBtn: React.CSSProperties = {
  marginTop: 8, padding: '6px 14px', borderRadius: 8, fontSize: 12,
  background: 'transparent', color: 'rgba(255,255,255,0.7)',
  border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer',
  fontFamily: 'inherit',
}
const textInput: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: '#061322', border: '1px solid rgba(255,255,255,0.18)',
  color: 'white', fontSize: 15, fontFamily: 'inherit',
}
