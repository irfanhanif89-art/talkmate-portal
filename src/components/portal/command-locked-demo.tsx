'use client'

// Session 16 -- static demo content for TalkMate Command locked preview.
// Renders a Telegram-style conversation mockup plus a command stats card.

interface Bubble {
  side: 'sent' | 'received'
  text: string
}

const BUBBLES: Bubble[] = [
  { side: 'sent', text: 'How many calls today?' },
  { side: 'received', text: '7 calls today. 4 completed, 2 in progress, 1 missed. Est. revenue: $2,847.' },
  { side: 'sent', text: 'Assign next job to Mike' },
  { side: 'received', text: 'Done. Job #14 assigned to Mike D. (Loaded TT, Campbellfield to Epping). SMS sent to Mike.' },
  { side: 'sent', text: 'Pause agent for 2 hours' },
  { side: 'received', text: 'Agent paused until 1:05 PM. Calls will go to voicemail. Reply resume to restart early.' },
]

const RECENT = [
  { time: '2 min ago', text: 'How many calls today?', ok: true },
  { time: '14 min ago', text: 'Assign next job to Mike', ok: true },
  { time: '47 min ago', text: 'Pause agent for 2 hours', ok: true },
  { time: '1 hr ago', text: 'Show today\'s bookings', ok: true },
  { time: '2 hr ago', text: 'What\'s the wait time?', ok: true },
]

export default function CommandLockedDemo() {
  return (
    <div style={{ padding: 28, maxWidth: 980, margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>
      <header style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'white', margin: 0, marginBottom: 6 }}>
          TalkMate Command
        </h2>
        <p style={{ color: '#7BAED4', fontSize: 14, margin: 0 }}>
          Manage your dispatcher from Telegram. Send a message in plain English -- your bot handles the rest.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
        {/* Telegram mockup */}
        <div
          style={{
            background: '#0A1E38',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16,
            padding: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 18 }}>📨</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>@talkmate_command_bot</span>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 10,
                fontWeight: 800,
                padding: '3px 9px',
                borderRadius: 99,
                background: 'rgba(34,197,94,0.18)',
                color: '#22C55E',
                letterSpacing: '0.04em',
              }}
            >
              ACTIVE
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {BUBBLES.map((b, i) => (
              <div
                key={i}
                style={{
                  alignSelf: b.side === 'sent' ? 'flex-end' : 'flex-start',
                  maxWidth: '78%',
                  padding: '9px 13px',
                  borderRadius: 14,
                  fontSize: 13,
                  lineHeight: 1.45,
                  background: b.side === 'sent' ? '#E8622A' : '#071829',
                  color: b.side === 'sent' ? 'white' : '#C8D8EA',
                  border: b.side === 'sent' ? 'none' : '1px solid rgba(255,255,255,0.06)',
                  borderBottomRightRadius: b.side === 'sent' ? 4 : 14,
                  borderBottomLeftRadius: b.side === 'received' ? 4 : 14,
                }}
              >
                {b.text}
              </div>
            ))}
          </div>
        </div>

        {/* Command stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              background: '#0A1E38',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14,
              padding: 18,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#4A7FBB',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 6,
              }}
            >
              Commands today
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'white' }}>14</div>
            <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 6 }}>Last command 2 min ago</div>
          </div>

          <div
            style={{
              background: '#0A1E38',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 12 }}>Recent commands</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {RECENT.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    fontSize: 12,
                    paddingBottom: 8,
                    borderBottom: i === RECENT.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <span style={{ color: r.ok ? '#22C55E' : '#EF4444', flexShrink: 0 }}>{r.ok ? '✓' : '✗'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#C8D8EA' }}>{r.text}</div>
                    <div style={{ fontSize: 10, color: '#4A7FBB', marginTop: 2 }}>{r.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`@media (max-width: 880px) {
        div[style*="grid-template-columns: 1.4fr 1fr"] { grid-template-columns: 1fr !important; }
      }`}</style>
    </div>
  )
}
