import { NextResponse } from 'next/server'
import { requireSalesRep } from '@/lib/sales-auth'
import { createAdminClient } from '@/lib/supabase/server'

function initialsFrom(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export async function GET(req: Request) {
  const auth = await requireSalesRep(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  // Fetch the rep's is_legacy and created_at — requireSalesRep doesn't include
  // those in its SELECT.
  const admin = createAdminClient()
  const { data: meta } = await admin
    .from('sales_reps')
    .select('is_legacy, created_at')
    .eq('id', auth.rep.id)
    .maybeSingle()

  // Commission rates: contractor-flow defaults match the mobile mock and the
  // portal's contractor-onboarding flow.
  const commission_rate = 0.50   // 50% first-month MRR
  const bonus_rate = 0.025       // 2.5% annual close bonus

  return NextResponse.json({
    ok: true,
    rep: {
      id: auth.rep.id,
      name: auth.rep.full_name,
      email: auth.rep.email,
      sales_team_id: auth.rep.team_id,
      is_legacy: meta?.is_legacy ?? false,
      contractor_id: auth.rep.contractor_id,
      commission_rate,
      bonus_rate,
      joinedDate: meta?.created_at ?? null,
      initials: initialsFrom(auth.rep.full_name),
      notification_email: auth.rep.notification_email,
      phone: auth.rep.phone,
      status: auth.rep.status,
    },
  })
}
