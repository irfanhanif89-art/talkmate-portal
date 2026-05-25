'use client'

import { useCallback, useEffect, useState } from 'react'

interface DriverRow {
  id: string
  name: string
  phone: string
  email: string | null
  truck_type: string | null
  truck_rego: string | null
  is_online: boolean
  is_available: boolean
  is_active: boolean
  active_jobs: number
  total_jobs: number
}

interface PendingInvite {
  id: string
  email: string
  name: string
  phone: string | null
  truck_type: string | null
  status: string
  expires_at: string
  created_at: string
}

export function DriversTab({ onOpenInvite }: { onOpenInvite: () => void }) {
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const res = await fetch('/api/dispatch/drivers')
    const data = await res.json()
    if (data.ok) {
      setDrivers(data.drivers ?? [])
      setInvites(data.pending_invites ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { refetch() }, [refetch])

  async function deactivate(driverId: string) {
    if (!confirm('Deactivate this driver? They will no longer receive jobs.')) return
    await fetch(`/api/dispatch/drivers/${driverId}`, { method: 'DELETE' })
    refetch()
  }

  async function resendInvite(inviteId: string) {
    await fetch(`/api/dispatch/drivers/${inviteId}/resend-invite`, { method: 'POST' })
    alert('Invite resent.')
    refetch()
  }

  if (loading) return <div style={{ color: '#94a3b8', padding: 20 }}>Loading…</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button onClick={onOpenInvite} style={{
          padding: '10px 18px',
          background: '#E8622A',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}>+ Invite Driver</button>
      </div>

      {invites.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={sectionH}>Pending invites ({invites.length})</h2>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}>
            {invites.map(i => (
              <div key={i.id} style={{
                padding: 12, display: 'flex', alignItems: 'center', gap: 12,
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{i.name}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    {i.email}{i.phone ? ` · ${i.phone}` : ''}
                    {i.truck_type ? ` · ${i.truck_type}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  Expires {new Date(i.expires_at).toLocaleDateString('en-AU')}
                </div>
                <button onClick={() => resendInvite(i.id)} style={smallButton}>
                  Resend
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 style={sectionH}>Drivers ({drivers.length})</h2>
        <div style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', textAlign: 'left' }}>
                <th style={th}>Name</th>
                <th style={th}>Phone</th>
                <th style={th}>Truck</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Active</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map(d => (
                <tr key={d.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', opacity: d.is_active ? 1 : 0.5 }}>
                  <td style={td}>{d.name}</td>
                  <td style={td}>{d.phone}</td>
                  <td style={td}>{d.truck_type ?? '—'}{d.truck_rego ? ` · ${d.truck_rego}` : ''}</td>
                  <td style={td}>
                    <span style={{
                      background: d.is_online ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)',
                      color: d.is_online ? '#86efac' : '#94a3b8',
                      padding: '2px 8px', borderRadius: 4, fontSize: 11, textTransform: 'uppercase',
                    }}>
                      {!d.is_active ? 'Inactive' : d.is_online ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{d.active_jobs}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{d.total_jobs}</td>
                  <td style={td}>
                    {d.is_active && (
                      <button onClick={() => deactivate(d.id)} style={dangerButton}>Deactivate</button>
                    )}
                  </td>
                </tr>
              ))}
              {drivers.length === 0 && (
                <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#64748b', padding: '32px 12px' }}>
                  No drivers yet. Invite your first driver.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

const sectionH: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#94a3b8',
  textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px',
}
const th: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }
const td: React.CSSProperties = { padding: '10px 12px' }
const smallButton: React.CSSProperties = {
  background: 'transparent', color: '#7BAED4',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6, padding: '4px 10px', fontSize: 11,
  cursor: 'pointer', fontFamily: 'inherit',
}
const dangerButton: React.CSSProperties = {
  background: 'transparent', color: '#fca5a5',
  border: '1px solid rgba(252,165,165,0.4)',
  borderRadius: 6, padding: '4px 10px', fontSize: 11,
  cursor: 'pointer', fontFamily: 'inherit',
}
