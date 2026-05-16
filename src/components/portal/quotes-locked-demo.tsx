'use client'

// Session 16 -- static demo content for the Quotes locked preview.

const STAT_CARDS = [
  { label: 'Quotes this month', value: '34' },
  { label: 'Accepted', value: '28', color: '#22C55E' },
  { label: 'Declined', value: '4', color: '#EF4444' },
  { label: 'Avg distance', value: '18km' },
]

const QUOTES = [
  {
    name: 'Greg Thompson',
    route: 'Campbellfield → Epping',
    distance: '14.2km, 22 min',
    truck: 'Loaded TT',
    rate: 'Account',
    when: 'Tue 17 May 8:12am',
    total: '$356',
    status: 'Accepted',
    statusColor: '#22C55E',
    statusBg: 'rgba(34,197,94,0.18)',
  },
  {
    name: 'Sarah Mitchell',
    route: 'Brunswick → Geelong',
    distance: '72.4km, 58 min',
    truck: 'Loaded TT',
    rate: 'Retail',
    when: 'Tue 17 May 9:04am',
    total: '$647',
    status: 'Accepted',
    statusColor: '#22C55E',
    statusBg: 'rgba(34,197,94,0.18)',
  },
  {
    name: 'Unknown caller',
    route: 'Melbourne CBD → Ballarat',
    distance: '112km',
    truck: 'Loaded TT',
    rate: 'POA',
    when: 'Mon 16 May 3:40pm',
    total: 'POA',
    status: 'Pending',
    statusColor: '#F59E0B',
    statusBg: 'rgba(245,158,11,0.18)',
  },
]

export default function QuotesLockedDemo() {
  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto', fontFamily: 'Outfit, sans-serif' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white', marginBottom: 4 }}>Quote Log</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: 0 }}>
          Every quote your agent has given callers.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        {STAT_CARDS.map(s => (
          <div
            key={s.label}
            style={{
              background: '#0A1E38',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14,
              padding: '14px 18px',
              flex: 1,
              minWidth: 180,
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
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color ?? 'white' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Quote history table */}
      <div
        style={{
          background: '#0A1E38',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: '#C8D8EA' }}>
            <thead>
              <tr style={{ background: '#071829' }}>
                {['Date / Time', 'Caller', 'Route', 'Distance', 'Truck', 'Rate', 'Total', 'Status'].map(h => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#4A7FBB',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {QUOTES.map(q => (
                <tr key={q.name + q.when} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: 'white' }}>{q.when}</td>
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>{q.name}</td>
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: 'white' }}>{q.route}</td>
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>{q.distance}</td>
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>{q.truck}</td>
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>{q.rate}</td>
                  <td
                    style={{
                      padding: '12px 14px',
                      whiteSpace: 'nowrap',
                      fontWeight: 700,
                      color: q.total === 'POA' ? '#F59E0B' : 'white',
                    }}
                  >
                    {q.total}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 9px',
                        borderRadius: 99,
                        background: q.statusBg,
                        color: q.statusColor,
                      }}
                    >
                      {q.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
