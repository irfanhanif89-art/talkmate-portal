import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SalesShell from '@/components/sales/sales-shell'
import type { SalesRepRow } from '@/lib/sales-auth'

// Set ADMIN_EMAIL in Vercel environment variables
const ADMIN_EMAILS = ['hello@talkmate.com.au', process.env.ADMIN_EMAIL].filter(Boolean) as string[]

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/sales/dashboard')

  // Admins land on /admin — they shouldn't be browsing the sales rep
  // portal in their normal admin session.
  if (user.email && ADMIN_EMAILS.includes(user.email)) {
    redirect('/admin')
  }

  const { data: rep } = await supabase
    .from('sales_reps')
    .select('id, user_id, full_name, email, phone, team_id, status, commission_policy_version, policy_acknowledged_at, contract_signed_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!rep) {
    // Authenticated user but no sales_reps record — bounce to the
    // client portal which has its own "account isn't set up" screen.
    redirect('/dashboard')
  }

  if (rep.status === 'inactive') {
    return (
      <div style={{
        minHeight: '100vh', background: '#061322', color: 'white',
        fontFamily: 'Outfit, sans-serif',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}>
        <div style={{
          maxWidth: 460, padding: 32, borderRadius: 16,
          background: '#0A1E38', border: '1px solid rgba(255,255,255,0.08)',
          textAlign: 'center',
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, marginBottom: 10 }}>
            Your account has been deactivated
          </h1>
          <p style={{ fontSize: 14, color: '#7BAED4', lineHeight: 1.6, margin: 0, marginBottom: 18 }}>
            Please contact the TalkMate admin team if you believe this is in error.
          </p>
          <a
            href="mailto:hello@talkmate.com.au"
            style={{
              display: 'inline-block', padding: '10px 20px', borderRadius: 9,
              background: '#E8622A', color: 'white', textDecoration: 'none',
              fontSize: 13, fontWeight: 700,
            }}
          >Email TalkMate admin</a>
        </div>
      </div>
    )
  }

  return <SalesShell rep={rep as SalesRepRow}>{children}</SalesShell>
}
