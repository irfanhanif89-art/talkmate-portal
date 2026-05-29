import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  getDemoBusinessId,
  getDemoIndustry,
  validateDemoPortalToken,
} from '@/lib/demo-config'

interface Params {
  params: Promise<{ industry: string }>
}

export async function POST(request: NextRequest, { params }: Params) {
  const { industry } = await params

  // Validate token from header
  const token = request.headers.get('x-demo-token')
  if (!validateDemoPortalToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Validate industry
  const demoIndustry = getDemoIndustry(industry)
  if (!demoIndustry || !demoIndustry.available) {
    return NextResponse.json({ error: 'Invalid industry' }, { status: 404 })
  }

  const businessId = getDemoBusinessId(industry)
  if (!businessId) {
    return NextResponse.json({ error: 'Invalid industry' }, { status: 404 })
  }

  let body: { name?: string; address?: string; greeting?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, address, greeting } = body

  // Only update allowed fields. The .eq('is_demo', true) guard ensures
  // this route can NEVER write to a real client business.
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('businesses')
    .update({ name, address, greeting })
    .eq('id', businessId)
    .eq('is_demo', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
