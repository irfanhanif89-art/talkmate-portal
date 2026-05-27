import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validatePassword } from '@/lib/password'
import { sendPasswordChangedEmail } from '@/lib/auth-email'

export async function POST(request: NextRequest) {
  const { password } = await request.json()

  // Session 11 — apply the same strength check as signup.
  const pwError = validatePassword(password ?? '')
  if (pwError) return NextResponse.json({ error: pwError }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Fire-and-forget: a password change must surface to the account holder
  // even if the inbox is slow. Failures are logged but never block the
  // success response.
  if (user.email) {
    const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || null
    const when = new Date().toLocaleString('en-AU', {
      timeZone: 'Australia/Brisbane',
      dateStyle: 'long',
      timeStyle: 'short',
    }) + ' AEST'
    const name = (user.user_metadata?.full_name as string | undefined)
      ?? (user.user_metadata?.name as string | undefined)
      ?? null
    void sendPasswordChangedEmail({ to: user.email, name, when, ip })
  }

  return NextResponse.json({ success: true })
}
