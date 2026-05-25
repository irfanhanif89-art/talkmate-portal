import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { sendRepPortalAccessEmail, notifyAdminAlert } from '@/lib/sales-notify'
import { findAuthUserByEmail } from '@/lib/find-auth-user'

export const dynamic = 'force-dynamic'

// Re-fires the post-sign portal access email for a contractor whose
// initial provisioning email never arrived (Supabase auth email dropped
// to spam, Resend transient failure, etc.). Safe to call repeatedly —
// also re-runs inviteUserByEmail to refresh Supabase's magic link if
// the user has never set a password.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await ctx.params
  const admin = createAdminClient()

  const { data: contractor, error: fetchError } = await admin
    .from('contractors')
    .select('id, first_name, last_name, email, status, agreement_signed_at')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 })
  if (!contractor) return NextResponse.json({ ok: false, error: 'Contractor not found' }, { status: 404 })

  if (contractor.status !== 'active' || !contractor.agreement_signed_at) {
    return NextResponse.json(
      { ok: false, error: 'Portal access is only sent after the contractor has signed.' },
      { status: 400 },
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.talkmate.com.au'
  const dashboardUrl = `${appUrl.replace(/\/$/, '')}/sales/dashboard`
  const loginUrl = `${appUrl.replace(/\/$/, '')}/login?next=${encodeURIComponent('/sales/dashboard')}`
  const fullName = `${contractor.first_name} ${contractor.last_name}`.trim()

  // Refresh Supabase's magic link. If the auth user doesn't exist yet
  // (rare for a signed contractor but possible), inviteUserByEmail
  // creates them; otherwise it's a no-op that produces a new link.
  try {
    const inviteRes = await admin.auth.admin.inviteUserByEmail(contractor.email, {
      data: { full_name: fullName, role: 'sales_rep' },
      redirectTo: dashboardUrl,
    })
    if (inviteRes.error) {
      // Most likely: user already exists. Confirm with a paginated lookup.
      const existing = await findAuthUserByEmail(admin, contractor.email)
      if (!existing) {
        return NextResponse.json(
          { ok: false, error: `Could not refresh invite: ${inviteRes.error.message}` },
          { status: 500 },
        )
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: `Invite refresh failed: ${msg}` }, { status: 500 })
  }

  // Always send the Resend portal access email as the backup channel.
  const sendRes = await sendRepPortalAccessEmail({
    email: contractor.email,
    name: fullName,
    portalUrl: loginUrl,
  })

  if (sendRes && (sendRes as { ok?: boolean }).ok === false) {
    notifyAdminAlert(
      `⚠️ Resend portal-access email failed for ${fullName} (${contractor.email}). Manual recovery required.`,
    ).catch(() => {})
  }

  return NextResponse.json({ ok: true, email: contractor.email })
}
