import { NextResponse } from 'next/server'

// Vercel cron requests carry `Authorization: Bearer ${CRON_SECRET}`.
// We accept the same secret in development for manual testing.
export function verifyCron(req: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET
  // Fail closed: a missing secret must NOT leave the cron publicly callable.
  // Only allow the no-secret path in local development for manual testing.
  if (!expected) {
    if (process.env.NODE_ENV === 'development') return null
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
