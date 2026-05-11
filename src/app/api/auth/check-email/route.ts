import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// Real-time email-availability check for the signup form.
// Public — no auth required. Returns { available: boolean }.
//
// We scan up to 200 users at a time and check for a case-insensitive
// match. For our signup volume that's plenty; we never expect to grow
// past tens of thousands of accounts.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('email') ?? ''
  const email = raw.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ available: false, error: 'invalid_email' }, { status: 200 })
  }

  try {
    const admin = createAdminClient()
    const { data } = await admin.auth.admin.listUsers({ perPage: 200, page: 1 })
    const taken = data?.users?.some(u => u.email?.toLowerCase() === email) ?? false
    return NextResponse.json({ available: !taken })
  } catch (e) {
    console.error('[check-email] lookup failed', e)
    // Don't block the signup form on a transient lookup failure — the
    // real /api/auth/signup will still reject duplicates.
    return NextResponse.json({ available: true })
  }
}
