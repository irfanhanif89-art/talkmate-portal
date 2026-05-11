import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALLOWED_ORIGINS = [
  'https://talkmate.com.au',
  'https://www.talkmate.com.au',
]

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin') ?? ''
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]

  const checks: Record<string, { status: 'operational' | 'degraded' | 'outage'; latencyMs?: number }> = {}

  // 1. Supabase / database
  try {
    const start = Date.now()
    const supabase = await createClient()
    await supabase.from('businesses').select('id').limit(1)
    checks.database = { status: 'operational', latencyMs: Date.now() - start }
  } catch {
    checks.database = { status: 'outage' }
  }

  // 2. Vapi health (read from vapi_health table written by cron)
  try {
    const supabase = await createClient()
    const { data } = await supabase.from('vapi_health').select('*').eq('id', 1).single()
    if (data) {
      const consecutiveFails = data.consecutive_fails ?? 0
      checks.voice_agent = {
        status: consecutiveFails >= 3 ? 'outage' : consecutiveFails >= 1 ? 'degraded' : 'operational',
        latencyMs: data.last_latency_ms ?? undefined,
      }
    } else {
      checks.voice_agent = { status: 'operational' }
    }
  } catch {
    checks.voice_agent = { status: 'operational' }
  }

  // 3. Stripe — just confirm env var is set (no live call to avoid latency)
  checks.billing = {
    status: process.env.STRIPE_SECRET_KEY ? 'operational' : 'degraded',
  }

  // 4. Portal itself is operational if we got here
  checks.portal = { status: 'operational' }

  const allOperational = Object.values(checks).every(c => c.status === 'operational')
  const anyOutage = Object.values(checks).some(c => c.status === 'outage')

  return NextResponse.json(
    {
      status: anyOutage ? 'outage' : allOperational ? 'operational' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': corsOrigin,
        'Vary': 'Origin',
      },
    }
  )
}
