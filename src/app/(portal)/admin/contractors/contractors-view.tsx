'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Users } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/sales-format'
import InviteContractorModal from './invite-contractor-modal'

export type ContractorStatus =
  | 'invited' | 'agreement_sent' | 'signed' | 'active' | 'terminated'

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
}

const STATUS_STYLE: Record<ContractorStatus, { label: string; color: string; bg: string; border: string }> = {
  invited:         { label: 'Invited',         color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.4)' },
  agreement_sent:  { label: 'Agreement Sent',  color: '#4A9FE8', bg: 'rgba(74,159,232,0.15)',  border: 'rgba(74,159,232,0.4)' },
  signed:          { label: 'Signed',          color: '#22c55e', bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.4)' },
  active:          { label: 'Active',          color: '#22c55e', bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.4)' },
  terminated:      { label: 'Terminated',      color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.4)' },
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

export default function ContractorsView({ contractors }: { contractors: ContractorRow[] }) {
  const router = useRouter()
  const [inviteOpen, setInviteOpen] = useState(false)

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={22} /> Contractors
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', margin: '4px 0 0' }}>
            Sales contractors invited to sell TalkMate, plus their agreements and commissions.
          </p>
        </div>
        <button style={headBtn} onClick={() => setInviteOpen(true)}>
          <Plus size={16} /> Invite Contractor
        </button>
      </div>

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
