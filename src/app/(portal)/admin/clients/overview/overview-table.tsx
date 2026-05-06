'use client'

import { useMemo, useState } from 'react'
import { planLabel, statusColor, statusLabel } from '../types'

interface OverviewRow {
  id: string
  name: string
  plan: string | null
  agent_phone_number: string | null
  account_status: string | null
  tos_accepted_at: string | null
  tos_accepted_version: string | null
  welcome_email_sent: boolean | null
  manual_next_billing_date: string | null
  owner_user_id: string
  owner_email: string | null
  owner_last_sign_in_at: string | null
  calls_this_month: number
  next_billing_date: string | null
}

type SortKey =
  | 'name' | 'plan' | 'agent' | 'calls' | 'status'
  | 'tos' | 'welcome' | 'first_login' | 'next_billing'

export default function OverviewTable({ rows }: { rows: OverviewRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' })

  const sorted = useMemo(() => {
    const out = [...rows]
    out.sort((a, b) => {
      const cmp = compareBy(a, b, sort.key)
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return out
  }, [rows, sort])

  function header(label: string, key: SortKey) {
    const active = sort.key === key
    return (
      <th
        onClick={() => setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))}
        style={{
          textAlign: 'left' as const, padding: '11px 14px',
          fontSize: 11, fontWeight: 700, color: active ? '#E8622A' : '#4A7FBB',
          textTransform: 'uppercase' as const, letterSpacing: '0.06em',
          cursor: 'pointer', userSelect: 'none' as const, whiteSpace: 'nowrap' as const,
        }}
      >
        {label}{active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
      </th>
    )
  }

  return (
    <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}>
        <thead>
          <tr style={{ background: '#071829' }}>
            {header('Business', 'name')}
            {header('Plan', 'plan')}
            {header('Agent', 'agent')}
            {header('Calls / mo', 'calls')}
            {header('Status', 'status')}
            {header('T&C', 'tos')}
            {header('Welcome', 'welcome')}
            {header('First login', 'first_login')}
            {header('Next billing', 'next_billing')}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={9} style={{ padding: 28, textAlign: 'center' as const, fontSize: 13, color: '#7BAED4' }}>No clients yet.</td></tr>
          )}
          {sorted.map((r, i) => (
            <tr key={r.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? '#0A1E38' : '#071829' }}>
              <td style={{ padding: '12px 14px', fontSize: 13 }}>
                <p style={{ fontWeight: 600, color: 'white', margin: 0 }}>{r.name}</p>
                <p style={{ fontSize: 11, color: '#7BAED4', margin: '2px 0 0 0' }}>{r.owner_email ?? '—'}</p>
              </td>
              <td style={{ padding: '12px 14px', fontSize: 12 }}>
                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'rgba(232,98,42,0.12)', color: '#E8622A', fontWeight: 700 }}>
                  {planLabel(r.plan)}
                </span>
              </td>
              <td style={{ padding: '12px 14px', fontSize: 12 }}>
                {r.agent_phone_number ? (
                  <span style={{ color: '#22C55E', fontWeight: 600 }}>● Live <span style={{ color: '#7BAED4', fontWeight: 400, marginLeft: 4 }}>{r.agent_phone_number}</span></span>
                ) : (
                  <span style={{ color: '#F59E0B' }}>○ Not built</span>
                )}
              </td>
              <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: 'white' }}>{r.calls_this_month}</td>
              <td style={{ padding: '12px 14px' }}>
                <span style={{
                  fontSize: 11, padding: '3px 9px', borderRadius: 99, fontWeight: 700,
                  background: `${statusColor(r.account_status as never)}22`, color: statusColor(r.account_status as never),
                }}>{statusLabel(r.account_status as never)}</span>
              </td>
              <td style={{ padding: '12px 14px', fontSize: 12, color: r.tos_accepted_at ? '#22C55E' : '#F59E0B' }}>
                {r.tos_accepted_at ? `✓ ${new Date(r.tos_accepted_at).toLocaleDateString('en-AU')}` : '✗ Not yet'}
              </td>
              <td style={{ padding: '12px 14px', fontSize: 12, color: r.welcome_email_sent ? '#22C55E' : '#F59E0B' }}>
                {r.welcome_email_sent ? '✓ Sent' : '✗ Not sent'}
              </td>
              <td style={{ padding: '12px 14px', fontSize: 12, color: '#7BAED4' }}>
                {r.owner_last_sign_in_at ? new Date(r.owner_last_sign_in_at).toLocaleDateString('en-AU') : '—'}
              </td>
              <td style={{ padding: '12px 14px', fontSize: 12, color: '#7BAED4' }}>
                {r.next_billing_date ? new Date(r.next_billing_date).toLocaleDateString('en-AU') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function compareBy(a: OverviewRow, b: OverviewRow, key: SortKey): number {
  switch (key) {
    case 'name': return a.name.localeCompare(b.name)
    case 'plan': return (a.plan ?? '').localeCompare(b.plan ?? '')
    case 'agent': return (a.agent_phone_number ? 1 : 0) - (b.agent_phone_number ? 1 : 0)
    case 'calls': return a.calls_this_month - b.calls_this_month
    case 'status': return (a.account_status ?? '').localeCompare(b.account_status ?? '')
    case 'tos': return (a.tos_accepted_at ? 1 : 0) - (b.tos_accepted_at ? 1 : 0)
    case 'welcome': return (a.welcome_email_sent ? 1 : 0) - (b.welcome_email_sent ? 1 : 0)
    case 'first_login':
      return (a.owner_last_sign_in_at ?? '').localeCompare(b.owner_last_sign_in_at ?? '')
    case 'next_billing':
      return (a.next_billing_date ?? '').localeCompare(b.next_billing_date ?? '')
    default: return 0
  }
}
