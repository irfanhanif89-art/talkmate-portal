import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const auth = verifyCron(request)
  if (auth) return auth

  const supabase = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.talkmate.com.au'
  const correctUrl = appUrl + '/api/vapi/functions'
  const apiKey = process.env.VAPI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'VAPI_API_KEY missing' }, { status: 500 })

  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, vapi_agent_id, name, account_status')
    .not('vapi_agent_id', 'is', null)
    .in('account_status', ['active', 'trial', 'pending', 'pending_payment'])

  let fixed = 0, skipped = 0
  const errors: string[] = []

  for (const biz of businesses ?? []) {
    if (!biz.vapi_agent_id) continue
    try {
      const getRes = await fetch(`https://api.vapi.ai/assistant/${biz.vapi_agent_id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!getRes.ok) { errors.push(`${biz.name}: GET failed (${getRes.status})`); continue }
      const assistant = await getRes.json()
      if (assistant.serverUrl === correctUrl) { skipped++; continue }
      const patchRes = await fetch(`https://api.vapi.ai/assistant/${biz.vapi_agent_id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverUrl: correctUrl }),
      })
      if (patchRes.ok) fixed++
      else errors.push(`${biz.name}: PATCH failed (${patchRes.status})`)
    } catch (e) {
      errors.push(`${biz.name}: ${(e as Error).message}`)
    }
  }

  return NextResponse.json({ fixed, skipped, errors })
}

export const POST = GET
