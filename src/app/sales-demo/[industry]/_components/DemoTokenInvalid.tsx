'use client'

export default function DemoTokenInvalid() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#061322',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Outfit', system-ui, sans-serif",
        padding: '24px',
      }}
    >
      <h1
        style={{
          color: '#ffffff',
          fontSize: 24,
          fontWeight: 600,
          marginBottom: 12,
          textAlign: 'center',
        }}
      >
        Demo link not valid
      </h1>
      <p
        style={{
          color: 'rgba(255,255,255,0.55)',
          fontSize: 14,
          textAlign: 'center',
          maxWidth: 360,
        }}
      >
        This demo link is not valid. Please contact your TalkMate representative.
      </p>
    </div>
  )
}
