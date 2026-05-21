import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Set ADMIN_EMAIL in Vercel environment variables
const ADMIN_EMAILS = ['hello@talkmate.com.au', process.env.ADMIN_EMAIL].filter(Boolean) as string[]

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  if (user.email && ADMIN_EMAILS.includes(user.email)) {
    redirect('/admin')
  }

  // Sales rep? Send to /sales/dashboard. Otherwise standard client portal.
  const { data: rep } = await supabase
    .from('sales_reps')
    .select('id, status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (rep && rep.status === 'active') {
    redirect('/sales/dashboard')
  }

  redirect('/dashboard')
}
