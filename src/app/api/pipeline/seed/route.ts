import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { seedPipelineStages, hasPipeline } from '@/lib/pipeline'

// POST /api/pipeline/seed — seeds default pipeline stages for the current
// business based on its industry. Idempotent.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { data: business } = await supabase.from('businesses').select('id, industry').eq('owner_user_id', user.id).single()
  if (!business) return NextResponse.json({ ok: false }, { status: 404 })
  if (!hasPipeline(business.industry as string | null)) {
    return NextResponse.json({ ok: false, error: 'Industry does not use a pipeline' }, { status: 400 })
  }

  const admin = createAdminClient()
  const result = await seedPipelineStages(admin, business.id, business.industry)
  return NextResponse.json({ ok: true, ...result })
}
