import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Portal-access gate based on businesses.account_status.
//
// Only 'expired' (lapsed trial) and 'cancelled' should bounce a user
// away from the dashboard. Every other status — 'active', 'trial',
// 'pending_payment', 'pending', 'suspended', or anything unrecognised
// — must let the user through.
//
// IMPORTANT: a single owner can legitimately have multiple business
// rows (e.g. an admin created a duplicate, cancelled one, kept the
// other active). We only block when EVERY row the user owns is in a
// blocked state. If any row is non-blocked the user gets through.
// Previously this picked data[0] arbitrarily, which caused an
// infinite redirect loop for GM Towing (cancelled duplicate sorted
// first → middleware bounced them to /subscribe → /subscribe page
// failed to render → eventual "this page couldn't load").
async function shouldBlockPortalAccess(userId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/businesses?owner_user_id=eq.${userId}&select=account_status`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    )
    const data: { account_status: string | null }[] = await res.json()
    if (!Array.isArray(data) || data.length === 0) return false
    // Block only when EVERY row is blocked. Any non-blocked row means
    // the user has at least one live account.
    return data.every(row => {
      const s = (row.account_status ?? '').toLowerCase()
      return s === 'expired' || s === 'cancelled'
    })
  } catch {
    // Don't lock users out on a transient lookup failure.
    return false
  }
}

async function needsAdminTosGate(userId: string): Promise<boolean> {
  try {
    // Filter out cancelled/expired rows and prefer the newest remaining
    // row. Picking bizData[0] from an unordered query that included
    // a stale cancelled duplicate (with onboarded_by='admin' and
    // tos_accepted_at = null) used to wrongly force the user through
    // /accept-terms even when their live row had already accepted.
    const bizRes = await fetch(
      `${SUPABASE_URL}/rest/v1/businesses?owner_user_id=eq.${userId}` +
      `&select=id,onboarded_by,tos_accepted_at` +
      `&account_status=not.in.(cancelled,expired)` +
      `&order=created_at.desc`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    )
    const bizData: { id: string; onboarded_by: string | null; tos_accepted_at: string | null }[] = await bizRes.json()
    if (!Array.isArray(bizData) || bizData.length === 0) return false
    const biz = bizData[0]
    if (biz.onboarded_by !== 'admin') return false
    if (biz.tos_accepted_at) return false

    const accRes = await fetch(
      `${SUPABASE_URL}/rest/v1/legal_acceptances?client_id=eq.${biz.id}&select=id&limit=1`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    )
    const accData: { id: string }[] = await accRes.json()
    return !Array.isArray(accData) || accData.length === 0
  } catch {
    return false
  }
}

// Super-admin emails - bypass all subscription and ToS checks
const ADMIN_EMAILS = ['hello@talkmate.com.au', 'irfanhanif89@gmail.com']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  // Admin user - short-circuit ALL checks immediately after we have the user.
  // hello@talkmate.com.au has no business/subscription and must never be
  // redirected to /subscribe or /accept-terms.
  if (user?.email && ADMIN_EMAILS.includes(user.email)) {
    if (path === '/login' || path === '/register') {
      const url = new URL('/admin', request.url)
      const res = NextResponse.redirect(url)
      supabaseResponse.cookies.getAll().forEach(c => res.cookies.set(c.name, c.value))
      return res
    }
    return supabaseResponse
  }

  const protectedPaths = [
    '/dashboard', '/calls', '/catalog', '/appointments', '/analytics',
    '/settings', '/billing', '/admin', '/onboarding', '/contacts',
    '/jobs', '/command-centre', '/wl-preview', '/refer-and-earn',
  ]

  const authOnlyPaths = ['/subscribe', '/accept-terms']
  const guestOnlyPaths = ['/login', '/register', '/verify-email']

  const isAdminApprove = path.startsWith('/admin/approve')
  const isProtected = protectedPaths.some(p => path.startsWith(p))
  const isAuthOnly = authOnlyPaths.some(p => path.startsWith(p))
  const isGuestOnly = guestOnlyPaths.includes(path)

  function redirect(to: string) {
    const url = new URL(to, request.url)
    const res = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach(c => res.cookies.set(c.name, c.value))
    return res
  }

  if (!user && (isProtected || isAuthOnly)) {
    // Preserve destination so login can redirect back after sign-in
    const next = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)
    return redirect(`/login?next=${next}`)
  }

  if (user && isGuestOnly) {
    // Always redirect to /dashboard - no async DB calls, no loop risk.
    // Dashboard and protected routes handle subscription + TOS gates from there.
    return redirect('/dashboard')
  }

  // /admin paths bypass subscription check (admin/approve already did this)
  // /admin/view-as is a transitional signout page - always allow through
  if (path.startsWith('/admin')) {
    return supabaseResponse
  }

  if (
    user &&
    isProtected &&
    !path.startsWith('/accept-terms') &&
    !path.startsWith('/onboarding') &&
    !isAdminApprove
  ) {
    const needsTos = await needsAdminTosGate(user.id)
    if (needsTos) {
      return redirect(`/accept-terms?next=${encodeURIComponent(path)}`)
    }
  }

  if (user && isProtected && !path.startsWith('/onboarding') && !isAdminApprove) {
    const blocked = await shouldBlockPortalAccess(user.id)
    if (blocked) {
      if (path.startsWith('/subscribe')) return supabaseResponse
      return redirect('/subscribe')
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
