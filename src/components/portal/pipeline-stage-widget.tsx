'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface PipelineStage {
  id: string
  stage_name: string
  stage_order: number
  color: string
  is_terminal: boolean
}

export interface PipelineRow { stage_id: string; entered_at: string }

interface Props {
  contactId: string
  stages: PipelineStage[]
  current: PipelineRow | null
}

export default function PipelineStageWidget({ contactId, stages, current }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  if (stages.length === 0) return null

  const currentStage = current ? stages.find(s => s.id === current.stage_id) : null
  const currentIndex = currentStage ? stages.findIndex(s => s.id === currentStage.id) : -1
  const nextStage = currentIndex >= 0 && currentIndex < stages.length - 1 ? stages[currentIndex + 1] : null

  async function moveTo(stageId: string) {
    setBusy(true)
    try {
      await fetch('/api/pipeline/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, stage_id: stageId }),
      })
      router.refresh()
    } finally {
      setBusy(false); setShowPicker(false)
    }
  }

  async function removeFromPipeline() {
    if (!confirm('Remove this contact from the pipeline?')) return
    setBusy(true)
    try {
      await fetch('/api/pipeline/move', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId }),
      })
      router.refresh()
    } finally { setBusy(false) }
  }

  return (
    <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Pipeline stage</div>

      {currentStage ? (
        <>
          <span style={{
            display: 'inline-block', fontSize: 13, fontWeight: 700, padding: '6px 12px', borderRadius: 99,
            background: `${currentStage.color}20`, color: currentStage.color,
            border: `1px solid ${currentStage.color}40`,
          }}>
            ● {currentStage.stage_name}
          </span>

          <div style={{ display: 'flex', gap: 4, marginTop: 12, flexWrap: 'wrap' }}>
            {stages.map((s, i) => (
              <div
                key={s.id}
                title={s.stage_name}
                style={{
                  height: 6, flex: 1, minWidth: 12, borderRadius: 3,
                  background: i <= currentIndex ? s.color : 'rgba(255,255,255,0.06)',
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#4A7FBB', marginTop: 6 }}>Stage {currentIndex + 1} of {stages.length}</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
            {nextStage && (
              <button onClick={() => moveTo(nextStage.id)} disabled={busy} style={primaryBtn}>
                Move to {nextStage.stage_name} →
              </button>
            )}
            <button onClick={() => setShowPicker(p => !p)} style={ghostBtn}>
              Move to specific stage
            </button>
            {showPicker && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4, padding: 8, background: '#071829', borderRadius: 9, border: '1px solid rgba(255,255,255,0.06)' }}>
                {stages.map(s => (
                  <button
                    key={s.id}
                    onClick={() => moveTo(s.id)}
                    disabled={busy || s.id === currentStage.id}
                    style={{
                      padding: '8px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                      background: s.id === currentStage.id ? 'rgba(232,98,42,0.1)' : 'transparent',
                      color: s.id === currentStage.id ? '#E8622A' : 'white',
                      border: 'none', cursor: s.id === currentStage.id ? 'default' : 'pointer',
                      textAlign: 'left' as const, fontFamily: 'Outfit, sans-serif',
                      opacity: s.id === currentStage.id ? 1 : 0.85,
                    }}
                  >
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: s.color, marginRight: 8 }} />
                    {s.stage_name}
                  </button>
                ))}
              </div>
            )}
            <button onClick={removeFromPipeline} style={{ ...ghostBtn, color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)' }}>Remove from pipeline</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, color: '#7BAED4', marginBottom: 12 }}>Not in pipeline yet.</div>
          <button onClick={() => setShowPicker(p => !p)} style={primaryBtn}>Add to pipeline</button>
          {showPicker && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, padding: 8, background: '#071829', borderRadius: 9, border: '1px solid rgba(255,255,255,0.06)' }}>
              {stages.map(s => (
                <button
                  key={s.id}
                  onClick={() => moveTo(s.id)}
                  disabled={busy}
                  style={{ padding: '8px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600, color: 'white', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' as const, fontFamily: 'Outfit, sans-serif' }}
                >
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: s.color, marginRight: 8 }} />
                  {s.stage_name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 8,
  background: '#E8622A', color: 'white', border: 'none',
  fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  textAlign: 'left' as const,
}
const ghostBtn: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 8,
  background: 'transparent', color: '#7BAED4', border: '1px solid rgba(255,255,255,0.1)',
  fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 500, cursor: 'pointer',
  textAlign: 'left' as const,
}
