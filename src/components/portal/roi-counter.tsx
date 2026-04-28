'use client'

interface Props {
  amount: number
  benchmarkLabel: string
  paying: { has: boolean; dayOfMonth?: number; planCost?: number }
  onDismissPaying?: () => void
}

// Brief Part 5 §3 (ROI counter) + §4 (Paying for itself banner).
export default function RoiCounter({ amount, benchmarkLabel, paying, onDismissPaying }: Props) {
  return (
    <>
      {paying.has && (
        <div style={{
          background: 'linear-gradient(135deg, #E8622A, #C04A0F)',
          color: 'white', borderRadius: 14, padding: '14px 18px', marginBottom: 18,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span style={{ fontSize: 24 }}>🎉</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>TalkMate has paid for itself this month</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 3 }}>
              Captured revenue exceeds your ${paying.planCost ?? 299}/mo plan{paying.dayOfMonth ? ` — and you're only on day ${paying.dayOfMonth}.` : '.'}
            </div>
          </div>
          {onDismissPaying && (
            <button onClick={onDismissPaying} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontSize: 14 }}>✕</button>
          )}
        </div>
      )}

      <div style={{
        background: '#0A1E38', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 16,
        padding: 22, marginBottom: 18, display: 'flex', gap: 18, alignItems: 'center',
      }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 24 }}>📈</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Est. revenue protected by TalkMate
          </div>
          <div style={{ fontSize: 13, color: '#7BAED4', marginBottom: 6, lineHeight: 1.4 }}>
            Without TalkMate this month, you would have missed an estimated
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#F59E0B', letterSpacing: '-1px', lineHeight: 1 }}>
            ${amount.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
            Based on industry benchmark ({benchmarkLabel}). Updated daily.
          </div>
        </div>
      </div>
    </>
  )
}
