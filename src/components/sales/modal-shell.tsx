'use client'

import { X } from 'lucide-react'

interface Props {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  maxWidth?: number
}

// Shared centred dialog wrapper used by all sales flow modals.
export default function ModalShell({ title, subtitle, onClose, children, maxWidth = 460 }: Props) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 150, padding: 20,
        background: 'rgba(6,19,34,0.85)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Outfit, sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth, maxHeight: '90vh', overflowY: 'auto',
          background: '#0A1E38', color: 'white',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14,
          padding: 26,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>{title}</h2>
            {subtitle && <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, marginTop: 4 }}>{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 7, padding: 6, color: '#7BAED4', cursor: 'pointer',
            }}
          ><X size={15} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
