import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function checkDatabase(): Promise<boolean> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/businesses?select=id&limit=1`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        signal: AbortSignal.timeout(2500),
      }
    )
    return res.ok
  } catch {
    return false
  }
}

async function checkVapi(): Promise<boolean> {
  try {
    const res = await fetch('https://api.vapi.ai/assistant?limit=1', {
      headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
      signal: AbortSignal.timeout(2500),
    })
    return res.ok
  } catch {
    return false
  }
}

async function checkStripe(): Promise<boolean> {
  try {
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: {
        Authorization: `Basic ${Buffer.from(process.env.STRIPE_SECRET_KEY! + ':').toString('base64')}`,
      },
      signal: AbortSignal.timeout(2500),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function GET() {
  const [database, vapi, stripe] = await Promise.all([
    checkDatabase(),
    checkVapi(),
    checkStripe(),
  ])

  const allOk = database && vapi && stripe
  const status = allOk ? 'ok' : 'degraded'

  return NextResponse.json(
    {
      status,
      checks: { database, vapi, stripe },
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 }
  )
}
