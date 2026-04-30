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

  // Pages that require login but NOT a subscription
  const authOnlyPaths = ['/subscribe']

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
