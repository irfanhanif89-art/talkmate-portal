import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function checkHasActiveSub(userId: string): Promise<boolean> {
  try {
    const bizRes = await fetch(
      `${SUPABASE_URL}/rest/v1/businesses?owner_user_id=eq.${userId}&select=id`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    )
    const bizData: { id: string }[] = await bizRes.json()
    if (!Array.isArray(bizData) || bizData.length === 0) return false

    const ids = bizData.map(b => b.id).join(',')
    const subRes = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?business_id=in.(${ids})&status=in.(active,trialing)&select=status&limit=1`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    )
    const subData: { status: string }[] = await subRes.json()
    return Array.isArray(subData) && subData.length > 0
  } catch {
    // If check fails, fail OPEN — let them through rather than cause a redirect loop
    return true
  }
}

// T&C HARD GATE for admin-created accounts (Session 4 brief Part 5).
// If the user's business was onboarded by admin and they've never recorded
// a legal_acceptances row, they're trapped on /accept-terms until they sign.
// Anything else (self-signups, partner signups, already-signed admin
// accounts) is unaffected by this check.
async function needsAdminTosGate(userId: string): Promise<boolean> {
  try {
    const bizRes = await fetch(
      `${SUPABASE_URL}/rest/v1/businesses?owner_user_id=eq.${userId}&select=id,onboarded_by,tos_accepted_at`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    )
    const bizData: { id: string; onboarded_by: string | null; tos_accepted_at: string | null }[] = await bizRes.json()
    if (!Array.isArray(bizData) || bizData.length === 0) return false
    const biz = bizData[0]
    if (biz.onboarded_by !== 'admin') return false
    if (biz.tos_accepted_at) return false

    // Double-check the audit log in case tos_accepted_at was wiped.
    const accRes = await fetch(
      `${SUPABASE_URL}/rest/v1/legal_acceptances?client_id=eq.${biz.id}&select=id&limit=1`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    )
    const accData: { id: string }[] = await accRes.json()
    return !Array.isArray(accData) || accData.length === 0
  } catch {
    // Fail OPEN — never trap a user behind a transient network blip.
    return false
  }
}

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

  // Pages that require login AND an active subscription
  const protectedPaths = [
    '/dashboard', '/calls', '/catalog', '/appointments', '/analytics',
    '/settings', '/billing', '/admin', '/onboarding', '/contacts',
    '/jobs', '/command-centre', '/wl-preview', '/refer-and-earn',
  ]

  // Pages that require login but NOT a subscription. /accept-terms must
  // be reachable before payment so admin-created accounts can sign first.
  const authOnlyPaths = ['/subscribe', '/accept-terms']

  // Public auth pages (logged-in users should not see these)
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

  // Not logged in → send to login
  if (!user && (isProtected || isAuthOnly)) {
    return redirect('/login')
  }

  // Logged in on a guest-only page → check sub and send to dashboard or subscribe
  if (user && isGuestOnly) {
    // Safety: never redirect /subscribe → /subscribe (would loop)
    if (path === '/subscribe') return supabaseResponse
    const hasSub = await checkHasActiveSub(user.id)
    return redirect(hasSub ? '/dashboard' : '/subscribe')
  }

  // Admin user bypass — hello@talkmate.com.au has no business record so the
  // subscription and ToS checks would wrongly redirect them. Let them through.
  const isAdminUser = user?.email === 'hello@talkmate.com.au'
  if (isAdminUser || path.startsWith('/admin')) {
    return supabaseResponse
  }

  // T&C HARD GATE — admin-created accounts must accept terms on first login
  // before they can access ANY portal page. Runs BEFORE the sub check so
  // unsigned admin clients land on /accept-terms even if they haven't paid yet.
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

  // Logged in on a protected path → must have active sub (except /onboarding and admin/approve)
  if (user && isProtected && !path.startsWith('/onboarding') && !isAdminApprove) {
    const hasSub = await checkHasActiveSub(user.id)
    if (!hasSub) {
      // Safety: if already heading to /subscribe, don't redirect again
      if (path.startsWith('/subscribe')) return supabaseResponse
      return redirect('/subscribe')
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
