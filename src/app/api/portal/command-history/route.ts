// GET /api/portal/command-history — mobile TalkMate Command log.
// Bearer (or cookie) via requireClient. Returns the latest command_history
// rows for the owner's business.

import { NextResponse } from 'next/server'
import { requireClient } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireClient(request)
  if ('error' in auth) return auth.error
  const { supabase, clientId } = auth

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 100)

  const { data, error } = await supabase
    .from('command_history')
    .select('id, platform, raw_message, parsed_intent, action_taken, success, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ commands: data ?? [] })
}
