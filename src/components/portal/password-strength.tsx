'use client'

// Reusable password strength indicator. Lives next to the password
// input on /signup, /accept-invite, and /settings/security. Pure
// presentational — assesses the password locally via assessPassword().

import { assessPassword } from '@/lib/password'

const BUCKET_STYLE: Record<string, { color: string; label: string; width: number }> = {
  empty: { color: 'rgba(255,255,255,0.1)', label: '—', width: 0 },
  weak: { color: '#EF4444', label: 'Weak', width: 25 },
  fair: { color: '#F59E0B', label: 'Fair', width: 50 },
  strong: { color: '#22C55E', label: 'Strong', width: 75 },
  'very strong': { color: '#22C55E', label: 'Very strong', width: 100 },
}

export default function PasswordStrength({
  password,
  hideWhenEmpty = true,
}: {
  password: string
  hideWhenEmpty?: boolean
}) {
  const result = assessPassword(password)
  if (hideWhenEmpty && result.bucket === 'empty') return null
  const style = BUCKET_STYLE[result.bucket]

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: '#7BAED4', fontWeight: 600 }}>Password strength</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: style.color }}>{style.label}</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${style.width}%`, height: '100%', background: style.color, transition: 'width 0.2s ease, background 0.2s ease' }} />
      </div>
      <ul style={{ marginTop: 10, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
        {result.rules.map(r => (
          <li
            key={r.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, color: r.passed ? '#22C55E' : 'rgba(255,255,255,0.45)',
            }}
          >
            <span style={{
              width: 14, height: 14, borderRadius: '50%',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: r.passed ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
              color: r.passed ? '#22C55E' : 'rgba(255,255,255,0.4)',
              fontSize: 10, fontWeight: 700, flexShrink: 0,
            }}>{r.passed ? '✓' : '·'}</span>
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
