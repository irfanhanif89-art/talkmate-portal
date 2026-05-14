import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validatePassword } from '@/lib/password'

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

  return NextResponse.json({ success: true })
}
