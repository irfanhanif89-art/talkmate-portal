import type { SupabaseClient } from '@supabase/supabase-js'

// Paginated lookup of an auth user by email. Replaces the unbounded
// listUsers() default (first page only, ~50 users) which silently
// breaks once a project crosses the page size. Caps at 10 pages of
// 200 users (= 2000) to bound the worst case.

const PAGE_SIZE = 200
const MAX_PAGES = 10

export async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<{ id: string; email: string | null } | null> {
  const target = email.toLowerCase()
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
    if (error) return null
    const users = data?.users ?? []
    const hit = users.find(u => (u.email ?? '').toLowerCase() === target)
    if (hit) return { id: hit.id, email: hit.email ?? null }
    if (users.length < PAGE_SIZE) return null
  }
  return null
}
