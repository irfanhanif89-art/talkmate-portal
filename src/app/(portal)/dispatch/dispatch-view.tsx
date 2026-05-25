'use client'

import { useState } from 'react'
import { LiveBoard } from '@/components/dispatch/LiveBoard'
import { JobsTab } from '@/components/dispatch/JobsTab'
import { DriversTab } from '@/components/dispatch/DriversTab'
import { SettingsTab } from '@/components/dispatch/SettingsTab'
import { NewJobModal } from '@/components/dispatch/NewJobModal'
import { InviteDriverModal } from '@/components/dispatch/InviteDriverModal'

type Tab = 'live' | 'jobs' | 'drivers' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'live', label: 'Live Board' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'drivers', label: 'Drivers' },
  { id: 'settings', label: 'Settings' },
]

interface Props {
  clientId: string
  businessName: string
  dispatchEnabled: boolean
}

export function DispatchView({ clientId, businessName, dispatchEnabled }: Props) {
  const [tab, setTab] = useState<Tab>('live')
  const [newJobOpen, setNewJobOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  if (!dispatchEnabled) {
    return (
      <div style={{
        maxWidth: 720, margin: '48px auto', padding: '32px 24px',
        textAlign: 'center', color: '#F2F6FB', fontFamily: 'Outfit, sans-serif',
      }}>
        <div style={{ fontSize: 48 }}>🚛</div>
        <h1 style={{ marginTop: 12, fontSize: 24, fontWeight: 700 }}>Dispatcher is not enabled</h1>
        <p style={{ marginTop: 12, fontSize: 15, color: '#94a3b8', lineHeight: 1.6 }}>
          Enable the AI Dispatcher to start managing driver jobs, tracking deliveries, and automating customer updates.
        </p>
        <button
          onClick={() => setTab('settings')}
          style={{
            marginTop: 16,
            padding: '12px 22px',
            background: '#E8622A',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 15,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Open settings
        </button>
        {tab === 'settings' && (
          <div style={{ marginTop: 32, textAlign: 'left' }}>
            <SettingsTab onChanged={() => window.location.reload()} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: 24, fontFamily: 'Outfit, sans-serif', color: '#F2F6FB', maxWidth: 1400, margin: '0 auto' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12, marginBottom: 20,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Dispatch Centre</h1>
          <div style={{ marginTop: 4, fontSize: 13, color: '#94a3b8' }}>{businessName}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setInviteOpen(true)}
            style={ghostButton}
          >Manage Drivers</button>
          <button
            onClick={() => setNewJobOpen(true)}
            style={primaryButton}
          >+ New Job</button>
        </div>
      </header>

      <nav style={{
        display: 'flex', gap: 4, padding: '0 0 12px',
        borderBottom: '1px solid rgba(255,255,255,0.08)', overflowX: 'auto',
        marginBottom: 16,
      }}>
        {TABS.map(t => {
          const active = t.id === tab
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: active ? 700 : 500,
                color: active ? '#E8622A' : '#94a3b8',
                background: 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid #E8622A' : '2px solid transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </nav>

      {tab === 'live' && <LiveBoard clientId={clientId} />}
      {tab === 'jobs' && <JobsTab />}
      {tab === 'drivers' && <DriversTab onOpenInvite={() => setInviteOpen(true)} />}
      {tab === 'settings' && <SettingsTab />}

      {newJobOpen && (
        <NewJobModal
          onClose={() => setNewJobOpen(false)}
          onCreated={() => { setNewJobOpen(false); setTab('live') }}
        />
      )}
      {inviteOpen && (
        <InviteDriverModal
          onClose={() => setInviteOpen(false)}
          onInvited={() => { setInviteOpen(false); setTab('drivers') }}
        />
      )}
    </div>
  )
}

const primaryButton: React.CSSProperties = {
  padding: '10px 18px',
  background: '#E8622A',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const ghostButton: React.CSSProperties = {
  padding: '10px 18px',
  background: 'rgba(255,255,255,0.06)',
  color: '#F2F6FB',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
