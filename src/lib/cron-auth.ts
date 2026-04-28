import { NextResponse } from 'next/server'

// Vercel cron requests carry `Authorization: Bearer ${CRON_SECRET}`.
// We accept the same secret in development for manual testing.
export function verifyCron(req: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET
  // If no secret set locally, allow (so `vercel dev` and tests don't break).
  if (!expected) return null
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
