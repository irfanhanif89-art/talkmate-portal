import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminSidebarLayout from '@/components/admin/AdminSidebarLayout'

// Shared chrome for every page under `/admin/*`. Wraps children in
// the persistent left-rail sidebar (AdminSidebarLayout) so navigation
// between admin sections doesn't require typing URLs.
//
// Auth is enforced here as well as in the parent `(portal)/layout.tsx`.
// Belt-and-braces — Next.js layouts can sometimes render before a
// parent redirect resolves during hot reload, and we'd rather double-
// check than briefly leak admin chrome to a logged-out user.
// Set ADMIN_EMAIL in Vercel environment variables
const ADMIN_EMAILS = ['hello@talkmate.com.au', process.env.ADMIN_EMAIL].filter(Boolean) as string[]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isSuperAdmin = !!user.email && ADMIN_EMAILS.includes(user.email)
  if (!isSuperAdmin) {
    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'admin') redirect('/dashboard')
  }

  return (
    <AdminSidebarLayout userEmail={user.email ?? null}>
      {children}
    </AdminSidebarLayout>
  )
}
