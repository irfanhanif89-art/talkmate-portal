'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Users, GitBranch, Check } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/sales-format'
import InviteContractorModal from './invite-contractor-modal'

export type ContractorStatus =
  | 'invited' | 'agreement_sent' | 'active' | 'terminated'

export interface ContractorRow {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  abn: string | null
  status: ContractorStatus
  agreement_signed_at: string | null
  signed_pdf_url: string | null
  created_at: string
  invite_expires_at: string | null
  termination_date: string | null
  earned_commission: number
  sales_rep_id: string | null
}

export interface PipelineRow {
  contractor_id: string
  rep_id: string
  rep_name: string
  leads_in_pipeline: number
  deals_won: number
  commission_earned: number
}

const STATUS_STYLE: Record<ContractorStatus, { label: string; color: string; bg: string; border: string }> = {
  invited:         { label: 'Invited',        color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.4)' },
  agreement_sent:  { label: 'Agreement Sent', color: '#3B82F6', bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.4)' },
  active:          { label: 'Active',         color: '#22C55E', bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.4)' },
  terminated:      { label: 'Terminated',     color: '#EF4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.4)' },
}

const wrap: React.CSSProperties = {
  padding: 24, fontFamily: 'Outfit, sans-serif', color: 'white',
  background: '#061322', minHeight: '100vh',
}
const card: React.CSSProperties = {
  background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12, padding: 18,
}
const headBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: '#22D3EE', color: '#061322', border: 'none',
  padding: '10px 16px', borderRadius: 10, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 14,
}
const tableHeadCell: React.CSSProperties = {
  textAlign: 'left', padding: '10px 8px', fontSize: 12, color: 'rgba(255,255,255,0.6)',
  fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)',
}
const tableCell: React.CSSProperties = {
  padding: '12px 8px', fontSize: 14, borderBottom: '1px solid rgba(255,255,255,0.05)',
}

function StatusBadge({ status }: { status: ContractorStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.invited
  return (
    <span style={{
      display: 'inline-block', padding: '3px 8px', borderRadius: 6,
      fontSize: 12, fontWeight: 600,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
    }}>{s.label}</span>
  )
}

function PortalAccessCell({ row }: { row: ContractorRow }) {
  if (row.status !== 'active') {
    return <span style={{ color: 'rgba(255,255,255,0.4)' }}></span>
  }
  if (row.sales_rep_id) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        color: '#22C55E', fontSize: 12, fontWeight: 600,
      }}>
        <Check size={14} /> Provisioned
      </span>
    )
  }
  return (
    <span style={{
      color: '#F59E0B', fontSize: 12, fontWeight: 600,
    }}>Pending</span>
  )
}

type Tab = 'contractors' | 'pipeline'

export default function ContractorsView({
  contractors, pipeline,
}: { contractors: ContractorRow[]; pipeline: PipelineRow[] }) {
  const router = useRouter()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('contractors')

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={22} /> Contractors
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', margin: '4px 0 0' }}>
            Sales contractors invited to sell TalkMate, plus their agreements, portal access and commissions.
          </p>
        </div>
        {tab === 'contractors' && (
          <button style={headBtn} onClick={() => setInviteOpen(true)}>
            <Plus size={16} /> Invite Contractor
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
        <TabBtn icon={Users} label="Contractors" active={tab === 'contractors'} onClick={() => setTab('contractors')} />
        <TabBtn icon={GitBranch} label="Pipeline & Commissions" active={tab === 'pipeline'} onClick={() => setTab('pipeline')} />
      </div>

      {tab === 'contractors' && (
        <div style={card}>
          {contractors.length === 0 ? (
            <div style={{ padding: '40px 12px', textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>
              No contractors yet. Invite your first contractor to get started.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={tableHeadCell}>Name</th>
                    <th style={tableHeadCell}>Email</th>
                    <th style={tableHeadCell}>Phone</th>
                    <th style={tableHeadCell}>Status</th>
                    <th style={tableHeadCell}>Portal Access</th>
                    <th style={tableHeadCell}>ABN</th>
                    <th style={tableHeadCell}>Signed</th>
                    <th style={tableHeadCell}>Commission Earned</th>
                    <th style={tableHeadCell}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contractors.map(c => (
                    <tr key={c.id}>
                      <td style={tableCell}>{c.first_name} {c.last_name}</td>
                      <td style={tableCell}>{c.email}</td>
                      <td style={tableCell}>{c.phone ?? ''}</td>
                      <td style={tableCell}><StatusBadge status={c.status} /></td>
                      <td style={tableCell}><PortalAccessCell row={c} /></td>
                      <td style={tableCell}>{c.abn || 'Not provided'}</td>
                      <td style={tableCell}>{formatDate(c.agreement_signed_at)}</td>
                      <td style={tableCell}>{formatCurrency(c.earned_commission)}</td>
                      <td style={tableCell}>
                        <button
                          onClick={() => router.push(`/admin/contractors/${c.id}`)}
                          style={{
                            background: 'transparent', color: '#22D3EE',
                            border: '1px solid rgba(34,211,238,0.4)',
                            padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                            fontFamily: 'inherit', fontSize: 13,
                          }}
                        >View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'pipeline' && (
        <div style={card}>
          {pipeline.length === 0 ? (
            <div style={{ padding: '40px 12px', textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>
              No pipeline activity yet. Once a contractor signs and starts logging leads, their numbers show here.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={tableHeadCell}>Rep</th>
                    <th style={{ ...tableHeadCell, textAlign: 'right' }}>Leads in pipeline</th>
                    <th style={{ ...tableHeadCell, textAlign: 'right' }}>Deals won</th>
                    <th style={{ ...tableHeadCell, textAlign: 'right' }}>Commission earned</th>
                    <th style={tableHeadCell}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pipeline.map(p => (
                    <tr key={p.rep_id}>
                      <td style={tableCell}>{p.rep_name}</td>
                      <td style={{ ...tableCell, textAlign: 'right' }}>{p.leads_in_pipeline}</td>
                      <td style={{ ...tableCell, textAlign: 'right', color: '#22C55E', fontWeight: 700 }}>{p.deals_won}</td>
                      <td style={{ ...tableCell, textAlign: 'right', color: '#E8622A', fontWeight: 700 }}>{formatCurrency(p.commission_earned)}</td>
                      <td style={tableCell}>
                        <button
                          onClick={() => router.push(`/admin/contractors/${p.contractor_id}`)}
                          style={{
                            background: 'transparent', color: '#22D3EE',
                            border: '1px solid rgba(34,211,238,0.4)',
                            padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                            fontFamily: 'inherit', fontSize: 13,
                          }}
                        >View rep</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {inviteOpen && (
        <InviteContractorModal
          onClose={() => setInviteOpen(false)}
          onCreated={() => {
            setInviteOpen(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function TabBtn({ icon: Icon, label, active, onClick }: {
  icon: React.ComponentType<{ size?: number }>
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '11px 18px', background: 'transparent', border: 'none',
        borderBottom: active ? '2px solid #22D3EE' : '2px solid transparent',
        color: active ? '#22D3EE' : 'rgba(255,255,255,0.65)',
        fontFamily: 'Outfit, sans-serif', fontSize: 14, fontWeight: 700,
        cursor: 'pointer', marginBottom: -1,
      }}
    >
      <Icon size={15} /> {label}
    </button>
  )
}
