import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

  // IMPORTANT: must call getUser() to refresh session
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const protectedPaths = [
    '/dashboard', '/calls', '/catalog', '/appointments', '/analytics',
    '/settings', '/billing', '/admin', '/onboarding', '/contacts',
    '/jobs', '/command-centre', '/wl-preview', '/refer-and-earn',
  ]
  // Admin approve page is accessible without subscription (Irfan reviewing agents)
  const isAdminApprove = path.startsWith('/admin/approve')
  const isProtected = protectedPaths.some(p => path.startsWith(p))
  const isAuthPage = path === '/login' || path === '/register' || path === '/verify-email'

  if (!user && isProtected) {
    const redirectUrl = new URL('/login', request.url)
    const redirectResponse = NextResponse.redirect(redirectUrl)
    // Copy all cookies from supabaseResponse to the redirect
    supabaseResponse.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie.name, cookie.value)
    })
    return redirectResponse
  }

  if (user && isAuthPage) {
    // Check if user has an active subscription - if not, send to /subscribe not /dashboard
    let hasSub = false
    try {
      const bizRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/businesses?owner_user_id=eq.${user.id}&select=id`,
        { headers: { 'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } }
      )
      const bizData: { id: string }[] = await bizRes.json()
      if (bizData.length > 0) {
        const ids = bizData.map(b => b.id).join(',')
        const subRes = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/subscriptions?business_id=in.(${ids})&status=in.(active,trialing)&select=status&limit=1`,
          { headers: { 'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } }
        )
        const subData: { status: string }[] = await subRes.json()
        hasSub = subData.length > 0
      }
    } catch {}
    const redirectUrl = new URL(hasSub ? '/dashboard' : '/subscribe', request.url)
    const redirectResponse = NextResponse.redirect(redirectUrl)
    supabaseResponse.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie.name, cookie.value)
    })
    return redirectResponse
  }

  // Subscription gate: authenticated users on protected paths must have an active subscription.
  // /onboarding is excluded so users can complete setup immediately after payment
  // (the webhook may not have fired yet when Stripe redirects them back).
  if (user && isProtected && !path.startsWith('/onboarding') && !isAdminApprove) {
    try {
      const bizRes2 = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/businesses?owner_user_id=eq.${user.id}&select=id`,
        { headers: { 'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } }
      )
      const bizData2: { id: string }[] = await bizRes2.json()
      if (bizData2.length > 0) {
        const ids2 = bizData2.map(b => b.id).join(',')
        const subRes2 = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/subscriptions?business_id=in.(${ids2})&status=in.(active,trialing)&select=status&limit=1`,
          { headers: { 'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } }
        )
        const subData2: { status: string }[] = await subRes2.json()
        if (subData2.length === 0) {
          const redirectUrl = new URL('/subscribe', request.url)
          const redirectResponse = NextResponse.redirect(redirectUrl)
          supabaseResponse.cookies.getAll().forEach(cookie => {
            redirectResponse.cookies.set(cookie.name, cookie.value)
          })
          return redirectResponse
        }
      }
    } catch {}
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
