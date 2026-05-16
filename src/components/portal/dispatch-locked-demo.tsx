'use client'

// Session 16 -- static demo content rendered inside the Dispatch locked
// preview. Numbers and rows are hardcoded so the page never depends on
// the real dispatch tables when the client is on a non-Pro plan.

const STAT_CARDS = [
  { label: 'Active jobs', value: '4', color: '#4A9FE8' },
  { label: 'Drivers on shift', value: '3', sub: '1 available', color: '#22C55E' },
  { label: 'Jobs today', value: '11', sub: '8 completed', color: '#E8622A' },
  { label: 'Est. revenue today', value: '$4,280', color: '#22C55E' },
]

const ACTIVE_JOBS = [
  {
    name: 'Greg Thompson',
    route: 'Campbellfield → Epping',
    distance: '14km',
    truck: 'Loaded TT',
    timing: 'Started 8:12am',
    driver: 'Mike D.',
    dot: '#22C55E',
  },
  {
    name: 'Dave Kowalski',
    route: 'Brunswick → Geelong',
    distance: '72km',
    truck: 'Loaded TT',
    timing: 'Due 9:00am',
    driver: 'Steve R.',
    dot: '#E8622A',
  },
  {
    name: 'Lisa Papadopoulos',
    route: 'Thomastown → Bundoora',
    distance: '8km',
    truck: 'Empty TT',
    timing: 'Due 11:00am',
    driver: 'Unassigned',
    dot: '#F59E0B',
  },
  {
    name: 'Mike Renaldo',
    route: 'Port Melbourne → CBD',
    distance: '12km',
    truck: 'Sideloader',
    timing: 'Due 1:00pm',
    driver: 'John K.',
    dot: '#4A9FE8',
  },
]

const DRIVERS = [
  { name: 'Mike D.', state: 'On job -- ETA 10:30am', color: '#E8622A' },
  { name: 'Steve R.', state: 'Available', color: '#22C55E' },
  { name: 'John K.', state: 'Off shift until 2pm', color: '#9CA3AF' },
]

export default function DispatchLockedDemo() {
  return (
    <div style={{ padding: 24, color: '#F2F6FB', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>Dispatch</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: '4px 0 0 0' }}>
          Live driver board, job queue, and capacity at a glance.
        </p>
      </div>

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
          marginBottom: 22,
        }}
      >
        {STAT_CARDS.map(s => (
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
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
            {s.sub && (
              <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 4 }}>{s.sub}</div>
            )}
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 16,
        }}
      >
        {/* Active jobs */}
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
              padding: '14px 18px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              fontSize: 11,
              fontWeight: 700,
              color: '#7BAED4',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Active jobs board
          </div>
          {ACTIVE_JOBS.map(j => (
            <div
              key={j.name}
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 99,
                  background: j.dot,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{j.name}</div>
                <div style={{ fontSize: 12, color: '#C8D8EA', marginTop: 2 }}>
                  {j.route}{' '}
                  <span style={{ color: '#4A7FBB' }}>({j.distance})</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#7BAED4', textAlign: 'right' }}>
                <div>{j.truck}</div>
                <div>{j.timing}</div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 99,
                  background: j.driver === 'Unassigned' ? 'rgba(245,158,11,0.18)' : 'rgba(74,159,232,0.18)',
                  color: j.driver === 'Unassigned' ? '#F59E0B' : '#4A9FE8',
                  minWidth: 80,
                  textAlign: 'center',
                }}
              >
                {j.driver}
              </span>
            </div>
          ))}
        </div>

        {/* Drivers panel */}
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
              padding: '14px 18px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              fontSize: 11,
              fontWeight: 700,
              color: '#7BAED4',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Drivers
          </div>
          {DRIVERS.map(d => (
            <div
              key={d.name}
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{d.name}</div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '3px 9px',
                    borderRadius: 99,
                    background: `${d.color}28`,
                    color: d.color,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {d.color === '#22C55E' ? 'Available' : d.color === '#E8622A' ? 'On job' : 'Off shift'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#7BAED4', marginTop: 4 }}>{d.state}</div>
            </div>
          ))}
        </div>
      </div>

      <style>{`@media (max-width: 1000px) {
        div[style*="grid-template-columns: 2fr 1fr"] { grid-template-columns: 1fr !important; }
      }`}</style>
    </div>
  )
}
