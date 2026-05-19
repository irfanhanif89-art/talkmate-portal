'use client'

import { useMemo, useState } from 'react'
import {
  getSmsLabel,
  formatAuPhone,
  clientSmsStatus,
  SMS_FILTER_BUCKETS,
} from '@/lib/sms-labels'

export interface SmsActivityRow {
  id: string
  to_phone: string | null
  message: string
  sms_type: string | null
  status: string | null
  sent_at: string | null
  call_id: string | null
}

function monthKey(iso: string | null): string {
  if (!iso) return 'unknown'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  if (key === 'unknown') return 'Unknown'
  const [y, m] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).replace(' am', 'am').replace(' pm', 'pm')
}

const BUCKETS = ['All', ...Object.keys(SMS_FILTER_BUCKETS)] as const

export default function SmsActivityView({
  rows, used, cap,
}: {
  rows: SmsActivityRow[]
  used: number
  cap: number
}) {
  const months = useMemo(() => {
    const set = new Set(rows.map(r => monthKey(r.sent_at)))
    const current = monthKey(new Date().toISOString())
    set.add(current)
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [rows])

  const [month, setMonth] = useState(() => monthKey(new Date().toISOString()))
  const [bucket, setBucket] = useState<typeof BUCKETS[number]>('All')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (monthKey(r.sent_at) !== month) return false
      if (bucket === 'All') return true
      const allowed = SMS_FILTER_BUCKETS[bucket]
      return !!r.sms_type && allowed?.has(r.sms_type)
    })
  }, [rows, month, bucket])

  const stats = useMemo(() => {
    let delivered = 0, pending = 0
    for (const r of filtered) {
      if (r.status === 'sent') delivered++
      else pending++
    }
    return { delivered, pending, total: filtered.length }
  }, [filtered])

  return (
    <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto', color: '#F2F6FB' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white', marginBottom: 4 }}>SMS Activity</h1>
          <p style={{ fontSize: 13, color: '#4A7FBB' }}>Messages sent to your customers by TalkMate.</p>
        </div>
        <div style={{ fontSize: 13, color: '#7BAED4', textAlign: 'right' }}>
          <div style={{ fontWeight: 700, color: 'white', fontSize: 16 }}>{used} / {cap}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>messages used this month</div>
        </div>
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={month} onChange={e => setMonth(e.target.value)} style={selectStyle}>
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {BUCKETS.map(b => (
            <button key={b} onClick={() => setBucket(b)} style={{
              padding: '9px 14px', borderRadius: 10, border: 'none',
              fontFamily: 'Outfit,sans-serif', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              background: bucket === b ? '#E8622A' : 'rgba(255,255,255,0.06)',
              color: bucket === b ? 'white' : '#4A7FBB',
            }}>{b}</button>
          ))}
        </div>
      </div>

      {/* Summary bar */}
      <div style={{
        background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14, padding: '14px 20px', marginBottom: 16,
        display: 'flex', gap: 32, flexWrap: 'wrap',
      }}>
        <Stat label={`${stats.total} messages sent this month`} color="white" />
        <Stat label={`${stats.delivered} delivered`} color="#22C55E" />
        <Stat label={`${stats.pending} pending`} color="rgba(255,255,255,0.55)" />
      </div>

      {/* Table */}
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={headerRowStyle}>
          {['Time', 'Sent to', 'Type', 'Message', 'Status'].map(h => (
            <div key={h} style={headerCellStyle}>{h}</div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#7BAED4' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
            <p style={{ fontSize: 14, marginBottom: 4 }}>No messages sent yet this month.</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', maxWidth: 420, margin: '0 auto' }}>
              TalkMate will automatically send booking confirmations, reminders,
              and follow-ups as your agent handles calls.
            </p>
          </div>
        )}

        {filtered.map((r, i) => {
          const isLast = i === filtered.length - 1
          const status = clientSmsStatus(r.status)
          const expanded = expandedId === r.id
          const preview = r.message.length > 80 ? r.message.slice(0, 80) + '…' : r.message
          return (
            <div key={r.id} style={{ borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
              <div style={rowStyle}>
                <div style={{ fontSize: 13, color: '#C8D8EA' }}>{formatDateTime(r.sent_at)}</div>
                <div style={{ fontSize: 13, color: 'white' }}>{formatAuPhone(r.to_phone)}</div>
                <div style={{ fontSize: 13, color: '#7BAED4' }}>{getSmsLabel(r.sms_type)}</div>
                <div style={{ fontSize: 13, color: '#C8D8EA', minWidth: 0 }}>
                  <span>{expanded ? r.message : preview}</span>
                  {r.message.length > 80 && (
                    <button onClick={() => setExpandedId(expanded ? null : r.id)}
                      style={{ marginLeft: 6, background: 'none', border: 'none', color: '#4A9FE8', cursor: 'pointer', fontSize: 12, padding: 0 }}>
                      {expanded ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: status.color }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: status.color }}>{status.label}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ label, color }: { label: string; color: string }) {
  return <div style={{ fontSize: 13, color, fontWeight: 600 }}>{label}</div>
}

const headerRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '160px 140px 180px 1fr 110px',
  gap: 16,
  padding: '12px 20px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
}

const headerCellStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#4A7FBB',
}

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '160px 140px 180px 1fr 110px',
  gap: 16,
  padding: '14px 20px',
  alignItems: 'center',
}

const selectStyle: React.CSSProperties = {
  background: '#071829',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'white',
  borderRadius: 10,
  padding: '9px 14px',
  fontFamily: 'Outfit,sans-serif',
  fontSize: 13,
  outline: 'none',
  cursor: 'pointer',
}
