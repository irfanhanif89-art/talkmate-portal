'use client'

import { useState } from 'react'

const OVERLAY: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.65)',
  zIndex: 200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const MODAL: React.CSSProperties = {
  background: '#0A1E38',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 16,
  padding: 32,
  width: '100%',
  maxWidth: 420,
  fontFamily: "'Outfit', system-ui, sans-serif",
}

const INPUT: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#ffffff',
  fontFamily: "'Outfit', system-ui, sans-serif",
  fontSize: 14,
  padding: '10px 14px',
  outline: 'none',
  boxSizing: 'border-box',
}

const LABEL: React.CSSProperties = {
  display: 'block',
  color: 'rgba(255,255,255,0.55)',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  marginBottom: 6,
  fontFamily: "'Outfit', system-ui, sans-serif",
}

export default function DemoTeamSection() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('Member')
  const [toast, setToast] = useState<string | null>(null)

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setOpen(false)
    setEmail('')
    setRole('Member')
    setToast('Invite sent! (Demo mode - no real invite created)')
    setTimeout(() => setToast(null), 4000)
  }

  return (
    <>
      {/* Invite button */}
      <button
        onClick={() => setOpen(true)}
        style={{
          background: '#E8622A',
          color: '#ffffff',
          fontFamily: "'Outfit', system-ui, sans-serif",
          fontSize: 14,
          fontWeight: 600,
          padding: '10px 20px',
          borderRadius: 8,
          border: 'none',
          cursor: 'pointer',
          marginTop: 16,
        }}
      >
        Invite Team Member
      </button>

      {/* Toast */}
      {toast && (
        <div
          style={{
            marginTop: 16,
            background: 'rgba(16,185,129,0.12)',
            border: '1px solid rgba(16,185,129,0.3)',
            color: '#10B981',
            borderRadius: 8,
            padding: '10px 16px',
            fontSize: 13,
            fontFamily: "'Outfit', system-ui, sans-serif",
          }}
        >
          {toast}
        </div>
      )}

      {/* Modal */}
      {open && (
        <div style={OVERLAY} onClick={() => setOpen(false)}>
          <div style={MODAL} onClick={(e) => e.stopPropagation()}>
            <h3
              style={{
                color: '#ffffff',
                fontSize: 18,
                fontWeight: 700,
                margin: '0 0 20px',
              }}
            >
              Invite Team Member
            </h3>

            <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={LABEL}>Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  required
                  style={INPUT}
                />
              </div>

              <div>
                <label style={LABEL}>Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  style={{
                    ...INPUT,
                    cursor: 'pointer',
                    appearance: 'none',
                  }}
                >
                  <option value="Member">Member</option>
                  <option value="Manager">Manager</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  type="submit"
                  style={{
                    background: '#E8622A',
                    color: '#ffffff',
                    fontFamily: "'Outfit', system-ui, sans-serif",
                    fontSize: 14,
                    fontWeight: 600,
                    padding: '10px 20px',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    flex: 1,
                  }}
                >
                  Send Invite
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    color: 'rgba(255,255,255,0.7)',
                    fontFamily: "'Outfit', system-ui, sans-serif",
                    fontSize: 14,
                    fontWeight: 500,
                    padding: '10px 20px',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
