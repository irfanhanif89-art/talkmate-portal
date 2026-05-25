'use client'

// Sessions 36-37 — one-time consent prompt before the driver app
// starts broadcasting GPS. Shows on first /driver/dashboard visit
// where drivers.location_consent_at is NULL. On accept, the dashboard
// PATCHes /api/driver/me to record consent and then the Phase 4
// useDriverLocationBroadcast hook starts firing.

interface Props {
  open: boolean
  onAccept: () => void
}

const BRAND = {
  orange: '#E8622A',
  navy: '#061322',
}

export function LocationConsentModal({ open, onAccept }: Props) {
  if (!open) return null
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(6, 19, 34, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      zIndex: 50,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 14,
        padding: 24,
        maxWidth: 420,
        width: '100%',
        fontFamily: 'Outfit, sans-serif',
      }}>
        <h2 style={{ margin: 0, color: BRAND.navy, fontSize: 20, fontWeight: 700 }}>
          Live location tracking
        </h2>
        <p style={{ marginTop: 12, color: '#374151', fontSize: 15, lineHeight: 1.5 }}>
          TalkMate tracks your location while you are online so your dispatcher can see where the fleet is and route jobs efficiently.
        </p>
        <ul style={{ marginTop: 12, paddingLeft: 18, color: '#374151', fontSize: 14, lineHeight: 1.6 }}>
          <li>Tracking stops automatically when you go offline.</li>
          <li>Your location is only visible to your dispatcher and is never shared with customers.</li>
          <li>On iPhone, tracking only runs while the app is in the foreground.</li>
        </ul>
        <button
          onClick={onAccept}
          style={{
            marginTop: 20,
            width: '100%',
            background: BRAND.orange,
            color: '#fff',
            border: 'none',
            padding: '14px 16px',
            borderRadius: 10,
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          I understand — continue
        </button>
      </div>
    </div>
  )
}
