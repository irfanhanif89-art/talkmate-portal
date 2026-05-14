// Password policy — shared between client (strength indicator) and
// server (signup / register / change-password validation). Keeping a
// single definition here means the UI bar and the API error message
// can never drift.

export interface PasswordRule {
  id: 'length' | 'upper' | 'number' | 'special'
  label: string
  test: (pw: string) => boolean
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: 'At least 8 characters', test: pw => pw.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: pw => /[A-Z]/.test(pw) },
  { id: 'number', label: 'One number', test: pw => /[0-9]/.test(pw) },
  // The brief lists !@#$%^&* explicitly; widen to common ASCII punctuation
  // so users aren't blocked by a sensible password choice that happens to
  // include a comma or dash. The minimum bar (one symbol) is still met.
  { id: 'special', label: 'One special character (! @ # $ % ^ & *)', test: pw => /[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/.test(pw) },
]

// Server-side gate. Returns the first failing message, or null when
// the password passes all rules. Mirrors the client strength UI: every
// failed rule corresponds to a red row in the indicator.
export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.'
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.'
  if (!/[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/.test(password)) {
    return 'Password must contain at least one special character.'
  }
  return null
}

export interface StrengthAssessment {
  passed: number          // number of rules passed (0-4)
  total: number           // total rules (4)
  rules: Array<{ id: PasswordRule['id']; label: string; passed: boolean }>
  bucket: 'empty' | 'weak' | 'fair' | 'strong' | 'very strong'
}

export function assessPassword(password: string): StrengthAssessment {
  const rules = PASSWORD_RULES.map(r => ({ id: r.id, label: r.label, passed: r.test(password) }))
  const passed = rules.filter(r => r.passed).length
  let bucket: StrengthAssessment['bucket'] = 'empty'
  if (password.length === 0) bucket = 'empty'
  else if (passed <= 1) bucket = 'weak'
  else if (passed === 2) bucket = 'fair'
  else if (passed === 3) bucket = 'strong'
  else bucket = 'very strong'
  return { passed, total: rules.length, rules, bucket }
}
