'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Settings, Check } from 'lucide-react'
import type { PipelineIndustry, PipelineStageRow } from '@/lib/pipeline'

interface PipelineContact {
  pipeline_row_id: string
  contact_id: string
  stage_id: string
  entered_at: string
  name: string | null
  phone: string
  tags: string[] | null
  industry_data: Record<string, unknown>
}

interface Props {
  industry: PipelineIndustry
  stages: PipelineStageRow[]
  contacts: PipelineContact[]
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
}

function urgencyColor(days: number): string {
  if (days < 7) return '#22C55E'
  if (days < 14) return '#F59E0B'
  return '#EF4444'
}

function formatPhone(phone: string): string {
  const m = phone.match(/^\+61(\d{3})(\d{3})(\d{3})$/)
  return m ? `+61 ${m[1]} ${m[2]} ${m[3]}` : phone
}

export default function PipelineKanbanClient({ stages, contacts: initialContacts }: Props) {
  const router = useRouter()
  const [contacts, setContacts] = useState(initialContacts)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const map = new Map<string, PipelineContact[]>()
    for (const s of stages) map.set(s.id, [])
    for (const c of contacts) map.get(c.stage_id)?.push(c)
    return map
  }, [contacts, stages])

  async function moveContact(contactId: string, toStageId: string) {
    // Optimistic update
    setContacts(prev => prev.map(c => c.contact_id === contactId ? { ...c, stage_id: toStageId, entered_at: new Date().toISOString() } : c))
    try {
      const res = await fetch('/api/pipeline/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, stage_id: toStageId }),
      })
      if (!res.ok) throw new Error('Move failed')
      const stage = stages.find(s => s.id === toStageId)
      setToast(`Moved to ${stage?.stage_name}`)
      setTimeout(() => setToast(null), 2200)
    } catch {
      router.refresh()
    }
  }

  function onDragStart(e: React.DragEvent<HTMLDivElement>, contactId: string) {
    setDraggedId(contactId)
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDragEnd() { setDraggedId(null) }
  function onDragOver(e: React.DragEvent<HTMLDivElement>) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
  function onDrop(e: React.DragEvent<HTMLDivElement>, stageId: string) {
    e.preventDefault()
    if (!draggedId) return
    const c = contacts.find(x => x.contact_id === draggedId)
    if (c && c.stage_id !== stageId) moveContact(draggedId, stageId)
    setDraggedId(null)
  }

  const totalInPipeline = contacts.length

  return (
    <div style={{ padding: 28, color: '#F2F6FB' }}>
      <Link href="/contacts" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#7BAED4', textDecoration: 'none', marginBottom: 18 }}>
        <ArrowLeft size={14} /> All contacts
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', marginBottom: 4 }}>Your Pipeline</h1>
          <p style={{ fontSize: 13, color: '#7BAED4' }}>{totalInPipeline} contact{totalInPipeline === 1 ? '' : 's'} in pipeline · drag cards between columns to update.</p>
        </div>
        <button
          disabled
          title="Stage management coming in a follow-up"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: '#7BAED4', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, padding: '9px 14px', fontSize: 13, fontFamily: 'Outfit, sans-serif', cursor: 'not-allowed', opacity: 0.6 }}
        >
          <Settings size={13} /> Manage stages
        </button>
      </div>

      <div style={{
        display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 20,
        minHeight: 480,
      }}>
        {stages.map(stage => {
          const items = grouped.get(stage.id) ?? []
          return (
            <div
              key={stage.id}
              onDragOver={onDragOver}
              onDrop={e => onDrop(e, stage.id)}
              style={{
                flexShrink: 0, width: 280,
                background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14,
                display: 'flex', flexDirection: 'column',
              }}
            >
              <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: stage.color }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{stage.stage_name}</span>
                </div>
                <div style={{ fontSize: 11, color: '#7BAED4' }}>{items.length} contact{items.length === 1 ? '' : 's'}</div>
              </div>

              <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 80 }}>
                {items.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '16px 0', fontStyle: 'italic' }}>
                    No contacts yet
                  </div>
                ) : items.map(c => {
                  const days = daysSince(c.entered_at)
                  const urgency = urgencyColor(days)
                  const property = (c.industry_data as { property_interest?: string })?.property_interest
                  return (
                    <div
                      key={c.contact_id}
                      draggable
                      onDragStart={e => onDragStart(e, c.contact_id)}
                      onDragEnd={onDragEnd}
                      onClick={() => router.push(`/contacts/${c.contact_id}`)}
                      style={{
                        background: '#071829', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10,
                        padding: 12, cursor: 'grab',
                        opacity: draggedId === c.contact_id ? 0.4 : 1,
                        transition: 'opacity 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'white', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                          {c.name || formatPhone(c.phone)}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: urgency, padding: '2px 7px', borderRadius: 99, border: `1px solid ${urgency}40`, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
                          {days}d
                        </span>
                      </div>
                      {property && (
                        <div style={{ fontSize: 11, color: '#7BAED4', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                          🏠 {property}
                        </div>
                      )}
                      {(c.tags ?? []).length > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(74,159,232,0.12)', color: '#4A9FE8', textTransform: 'capitalize' as const }}>
                          {c.tags![0].replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 800, background: '#22C55E', color: 'white', padding: '11px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 12px 32px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Check size={14} /> {toast}
        </div>
      )}
    </div>
  )
}
