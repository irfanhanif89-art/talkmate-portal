'use client'

// Session 16 -- static demo content for the Scheduler locked preview
// shown to Starter plan clients. Renders a week-view calendar with a
// realistic spread of booked jobs across Mon-Sat.

interface DemoBooking {
  day: number   // 0=Mon, 5=Sat
  time: string  // display label
  hour: number  // 24h hour for positioning
  name: string
  route: string
  color: 'green' | 'orange' | 'blue'
}

const STATS = [
  { label: 'Jobs today', value: '7' },
  { label: 'Available slots', value: '4' },
  { label: 'Booked by agent', value: '5' },
  { label: 'Est. revenue', value: '$2,847' },
]

const BOOKINGS: DemoBooking[] = [
  { day: 0, time: '8am', hour: 8, name: 'Greg T.', route: 'Campbellfield → Epping', color: 'green' },
  { day: 0, time: '10am', hour: 10, name: 'Sarah M.', route: 'Fawkner → Preston', color: 'orange' },
  { day: 1, time: '9am', hour: 9, name: 'Dave K.', route: 'Brunswick → Geelong', color: 'orange' },
  { day: 1, time: '11am', hour: 11, name: 'Lisa P.', route: 'Thomastown → Bundoora', color: 'orange' },
  { day: 2, time: '9am', hour: 9, name: 'John B.', route: 'Laverton → Altona', color: 'blue' },
  { day: 2, time: '12pm', hour: 12, name: 'Anna W.', route: 'Sunshine → Werribee', color: 'orange' },
  { day: 3, time: '9am', hour: 9, name: 'Chris F.', route: 'Campbellfield → CBD', color: 'orange' },
  { day: 4, time: '8am', hour: 8, name: 'Pat L.', route: 'Coolaroo → Broadmeadows', color: 'orange' },
  { day: 4, time: '10am', hour: 10, name: 'Sam R.', route: 'Braeside → Dandenong', color: 'blue' },
  { day: 5, time: '10am', hour: 10, name: 'Mark D.', route: 'Fawkner → Preston', color: 'orange' },
]

const DAY_LABELS = ['Mon 16', 'Tue 17', 'Wed 18', 'Thu 19', 'Fri 20', 'Sat 21', 'Sun 22']
const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]

const BLOCK_COLORS: Record<DemoBooking['color'], { tint: string; border: string }> = {
  green: { tint: 'rgba(34,197,94,0.18)', border: '#22C55E' },
  orange: { tint: 'rgba(232,98,42,0.18)', border: '#E8622A' },
  blue: { tint: 'rgba(74,159,232,0.18)', border: '#4A9FE8' },
}

export default function SchedulerLockedDemo() {
  return (
    <div style={{ padding: 28, maxWidth: 1400, margin: '0 auto', color: '#F2F6FB', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>Scheduler</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: '4px 0 0 0' }}>
          Calendar, jobs, and scheduler settings. Your agent books here automatically.
        </p>
      </div>

      {/* Stats bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        {STATS.map(s => (
          <div
            key={s.label}
            style={{
              background: '#0A1E38',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14,
              padding: '14px 18px',
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
              {s.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'white' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {['Calendar', 'Job List', 'Settings'].map((t, i) => (
          <div
            key={t}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              color: i === 0 ? '#E8622A' : '#7BAED4',
              background: i === 0 ? 'rgba(232,98,42,0.13)' : 'transparent',
              border: i === 0 ? '1px solid rgba(232,98,42,0.25)' : '1px solid transparent',
            }}
          >
            {t}
          </div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <div
            style={{
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 6,
              background: '#E8622A',
              color: 'white',
            }}
          >
            Week
          </div>
          <div
            style={{
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 6,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#7BAED4',
            }}
          >
            Day
          </div>
        </div>
      </div>

      {/* Week calendar grid */}
      <div
        style={{
          background: '#0A1E38',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '70px repeat(7, 1fr)',
            background: '#071829',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ padding: '12px 8px', fontSize: 10, color: '#4A7FBB', textTransform: 'uppercase' }} />
          {DAY_LABELS.map(d => (
            <div
              key={d}
              style={{
                padding: '12px 8px',
                fontSize: 12,
                fontWeight: 700,
                color: '#C8D8EA',
                textAlign: 'center',
                borderLeft: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              {d}
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '70px repeat(7, 1fr)',
            position: 'relative',
          }}
        >
          {/* Hour rows */}
          {HOURS.map(h => (
            <div key={`row-${h}`} style={{ display: 'contents' }}>
              <div
                style={{
                  padding: '0 8px',
                  height: 60,
                  fontSize: 11,
                  color: '#7BAED4',
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-end',
                  paddingTop: 4,
                }}
              >
                {h > 12 ? `${h - 12}pm` : h === 12 ? '12pm' : `${h}am`}
              </div>
              {DAY_LABELS.map((d, i) => (
                <div
                  key={`cell-${h}-${i}`}
                  style={{
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                    borderLeft: '1px solid rgba(255,255,255,0.04)',
                    height: 60,
                    position: 'relative',
                  }}
                >
                  {BOOKINGS.filter(b => b.day === i && b.hour === h).map((b, bi) => {
                    const c = BLOCK_COLORS[b.color]
                    return (
                      <div
                        key={bi}
                        style={{
                          position: 'absolute',
                          inset: '4px 3px',
                          background: c.tint,
                          border: `1px solid ${c.border}`,
                          borderLeft: `3px solid ${c.border}`,
                          borderRadius: 6,
                          padding: '4px 6px',
                          fontSize: 11,
                          color: 'white',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {b.name}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: '#7BAED4',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {b.route}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
