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
    const { data: bizList } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id)
    let hasSub = false
    if (bizList && bizList.length > 0) {
      const bizIds = bizList.map((b: { id: string }) => b.id)
      const { data: sub } = await supabase.from('subscriptions').select('status').in('business_id', bizIds).in('status', ['active', 'trialing']).maybeSingle()
      hasSub = !!sub
    }
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
    const { data: bizList2 } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id)
    if (bizList2 && bizList2.length > 0) {
      const bizIds2 = bizList2.map((b: { id: string }) => b.id)
      const { data: sub } = await supabase.from('subscriptions').select('status').in('business_id', bizIds2).in('status', ['active', 'trialing']).maybeSingle()
      if (!sub) {
        const redirectUrl = new URL('/subscribe', request.url)
        const redirectResponse = NextResponse.redirect(redirectUrl)
        supabaseResponse.cookies.getAll().forEach(cookie => {
          redirectResponse.cookies.set(cookie.name, cookie.value)
        })
        return redirectResponse
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
