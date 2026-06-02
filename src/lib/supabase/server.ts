import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

// Admin client uses the service role key via the base supabase-js client (NOT
// @supabase/ssr). Using createServerClient here would read the user's session
// cookie and substitute the user's JWT into the Authorization header, silently
// overriding the service role key and causing RLS to fire.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// JWT-bound client for the mobile app (Authorization: Bearer <access-jwt>).
// Uses the ANON key plus the user's access token in the Authorization header,
// so RLS evaluates auth.uid() from the JWT exactly like the cookie session —
// SAME tenant isolation, NO service-role bypass. The caller MUST first verify
// the JWT signature via createAdminClient().auth.getUser(jwt) before trusting it.
export function createBearerClient(jwt: string) {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )
}
