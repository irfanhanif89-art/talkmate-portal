// Australian Business Number (ABN) format + checksum validation.
// 11 digits, weighted modulus check per the Australian Business Register
// specification. Used on both client (onboarding form) and server
// (save-details + sign API routes) so a single source of truth governs
// what we will accept.

export function isValidAbnFormat(abn: string): boolean {
  const digits = abn.replace(/\s/g, '')
  if (!/^\d{11}$/.test(digits)) return false

  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
  const d = digits.split('').map(Number)
  d[0] = d[0] - 1
  const sum = weights.reduce((acc, w, i) => acc + w * d[i], 0)
  return sum % 89 === 0
}

export function normaliseAbn(abn: string): string {
  return abn.replace(/\s/g, '')
}
