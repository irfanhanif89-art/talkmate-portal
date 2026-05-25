'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Phone, FileText, ExternalLink, X } from 'lucide-react'
import { daysSince } from '@/lib/sales-format'

export interface HitListItem {
  priority: 1 | 2 | 3 | 4 | 5
  reason: string
  reasonColor: string
  followupId: string | null
  leadId: string
  businessName: string
  contactName: string | null
  status: string
  updatedAt: string
}

interface Props {
  items: HitListItem[]
  repFirstName: string
}

export default function HitListClient({ items: initial, repFirstName }: Props) {
  const [items, setItems] = useState(initial)
  const [dismissing, setDismissing] = useState<string | null>(null)

  async function dismiss(followupId: string) {
    setDismissing(followupId)
    const res = await fetch(`/api/sales/followups/${followupId}/dismiss`, { method: 'PATCH' })
    if (res.ok) {
      setItems(prev => prev.filter(i => i.followupId !== followupId))
    }
    setDismissing(null)
  }

  return (
    <div style={{ padding: '24px 24px 40px', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
          Your hit list, {repFirstName}
        </h1>
        <p style={{ fontSize: 14, color: '#7BAED4', margin: 0, marginTop: 4 }}>
          {items.length === 0 ? 'No priority actions today.' : `${items.length} action${items.length === 1 ? '' : 's'} today, sorted by what needs you most.`}
        </p>
      </div>

      {items.length === 0 ? (
        <div style={{
          padding: 36, textAlign: 'center', borderRadius: 12,
          background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
          color: '#7BAED4', fontSize: 14,
        }}>You are all caught up. No priority actions today.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item, idx) => {
            const days = daysSince(item.updatedAt)
            return (
              <div
                key={`${item.leadId}-${item.priority}-${idx}`}
                style={{
                  display: 'flex', gap: 14, alignItems: 'flex-start',
                  padding: 16, borderRadius: 11,
                  background: '#0A1E38',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderLeft: `3px solid ${item.reasonColor}`,
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                  background: `${item.reasonColor}1A`, color: item.reasonColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 16,
                }}>{item.priority}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'inline-block', fontSize: 11, fontWeight: 700,
                    padding: '3px 9px', borderRadius: 99,
                    background: `${item.reasonColor}1A`, color: item.reasonColor,
                    border: `1px solid ${item.reasonColor}40`,
                    marginBottom: 6,
                  }}>{item.reason}</div>

                  <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>
                    {item.businessName}
                  </div>
                  <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 2 }}>
                    {item.contactName ?? 'no contact name'} · {days === 0 ? 'updated today' : `${days}d since update`}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                    <Link
                      href={`/sales/leads?lead=${item.leadId}`}
                      style={btnStyle('#7BAED4')}
                    ><ExternalLink size={12} /> View Lead</Link>
                    <Link
                      href={`/sales/leads?lead=${item.leadId}&log=call`}
                      style={btnStyle('#4A9FE8')}
                    ><Phone size={12} /> Log Call</Link>
                    {item.status === 'demo_done' && (
                      <Link
                        href={`/sales/leads/${item.leadId}/proposal`}
                        style={btnStyle('#E8622A')}
                      ><FileText size={12} /> Send Proposal</Link>
                    )}
                    {item.priority === 1 && item.followupId && (
                      <button
                        onClick={() => dismiss(item.followupId!)}
                        disabled={dismissing === item.followupId}
                        style={{ ...btnStyle('#ef4444'), border: '1px solid rgba(239,68,68,0.4)', cursor: 'pointer' }}
                      ><X size={12} /> Dismiss</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function btnStyle(color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '6px 11px', borderRadius: 7,
    background: 'transparent', color,
    border: `1px solid ${color}55`,
    fontSize: 12, fontWeight: 700, textDecoration: 'none',
    fontFamily: 'Outfit, sans-serif',
  }
}
