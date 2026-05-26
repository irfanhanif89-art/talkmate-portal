'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LEAD_STATUS_COLUMNS, LEAD_STATUS_STYLES, formatCurrency, timeAgo, type LeadStatus } from '@/lib/sales-format'
import BulkReassignLeadsModal from './BulkReassignLeadsModal'

export interface RepPipelineData {
  rep_id: string
  rep_name: string
  rep_status: string
  mrr_closed: number
  commission_earned: number
  pipeline_value: number
  stage_counts: Record<LeadStatus, number>
  recent_deals: Array<{
    id: string
    business_name: string
    status: LeadStatus
    updated_at: string | null
  }>
  open_lead_count: number
}

interface Props {
  rep: RepPipelineData
  destinationReps: Array<{ id: string; full_name: string; status: string }>
}

export default function SalesPipelineCard({ rep, destinationReps }: Props) {
  const router = useRouter()
  const [bulkOpen, setBulkOpen] = useState(false)
  const isInactive = rep.rep_status !== 'active'

  return (
    <>
      <div style={{
        background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14, padding: 22, color: 'white', fontFamily: 'Outfit, sans-serif',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'white' }}>{rep.rep_name}</div>
            <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                background: isInactive ? '#94a3b8' : '#22c55e',
              }} />
              {isInactive ? 'Inactive' : 'Active'}
            </div>
          </div>
          {rep.open_lead_count > 0 && (
            <button
              onClick={() => setBulkOpen(true)}
              style={{
                padding: '7px 12px', borderRadius: 8,
                background: 'transparent', color: '#7BAED4',
                border: '1px solid rgba(255,255,255,0.12)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'Outfit, sans-serif',
              }}
              title={`Reassign all ${rep.open_lead_count} open leads to another rep`}
            >
              Reassign open leads ({rep.open_lead_count})
            </button>
          )}
        </div>

        {/* Stat grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18,
          padding: 14, background: '#061322', borderRadius: 10,
        }}>
          <Mini label="MRR closed" value={formatCurrency(rep.mrr_closed)} accent="#22c55e" />
          <Mini label="Commission earned" value={formatCurrency(rep.commission_earned)} accent="#E8622A" />
          <Mini label="Pipeline value" value={formatCurrency(rep.pipeline_value)} accent="#7BAED4" />
        </div>

        {/* Stage counts */}
        <div style={{ marginBottom: 18 }}>
          <Label>Deals by stage</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {LEAD_STATUS_COLUMNS.map(s => {
              const count = rep.stage_counts[s] ?? 0
              const style = LEAD_STATUS_STYLES[s]
              return (
                <div
                  key={s}
                  style={{
                    padding: '6px 10px', borderRadius: 7,
                    background: count > 0 ? style.bg : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${count > 0 ? style.border : 'rgba(255,255,255,0.05)'}`,
                    fontSize: 11, color: count > 0 ? style.color : 'rgba(255,255,255,0.3)',
                    fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <span>{style.label}</span>
                  <span style={{ fontWeight: 800, opacity: count > 0 ? 1 : 0.5 }}>{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Recent deals */}
        <div>
          <Label>Recent deals</Label>
          {rep.recent_deals.length === 0 ? (
            <div style={{ fontSize: 12, color: '#7BAED4', fontStyle: 'italic' }}>No recent activity.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rep.recent_deals.map(d => {
                const style = LEAD_STATUS_STYLES[d.status]
                return (
                  <div
                    key={d.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 7,
                      background: 'rgba(255,255,255,0.02)',
                      fontSize: 12,
                    }}
                  >
                    <span style={{
                      padding: '2px 7px', borderRadius: 5,
                      background: style.bg, color: style.color,
                      fontSize: 10, fontWeight: 700, flexShrink: 0,
                    }}>{style.label}</span>
                    <span style={{ color: 'white', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.business_name}
                    </span>
                    <span style={{ color: '#7BAED4', fontSize: 11, flexShrink: 0 }}>{timeAgo(d.updated_at)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer link */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <Link
            href={`/admin/sales-team?rep=${rep.rep_id}`}
            style={{
              fontSize: 12, color: '#4A9FE8', textDecoration: 'none', fontWeight: 600,
            }}
          >
            View all leads →
          </Link>
        </div>
      </div>

      {bulkOpen && (
        <BulkReassignLeadsModal
          sourceRep={{
            id: rep.rep_id,
            full_name: rep.rep_name,
            status: rep.rep_status,
            open_lead_count: rep.open_lead_count,
          }}
          destinationReps={destinationReps.filter(r => r.id !== rep.rep_id && r.status === 'active')}
          onClose={() => setBulkOpen(false)}
          onSuccess={() => router.refresh()}
        />
      )}
    </>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, color: '#7BAED4',
      letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8,
    }}>{children}</div>
  )
}

function Mini({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div>
      <div style={{
        fontSize: 9, fontWeight: 800, color: accent,
        letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4,
      }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: 'white' }}>{value}</div>
    </div>
  )
}
