import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/calls/flag  body: { callId: string, messageIndex?: number }
// Marks a call as having a wrong AI response — flags it for retraining review.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { callId, messageIndex } = (await req.json().catch(() => ({}))) as { callId?: string; messageIndex?: number }
  if (!callId) return NextResponse.json({ ok: false, error: 'callId required' }, { status: 400 })

  // RLS will scope this to calls owned by the requesting user's business.
  const { error } = await supabase.from('calls').update({
    flagged_wrong_response: true,
    flagged_message_index: typeof messageIndex === 'number' ? messageIndex : null,
    flagged: true,
  }).eq('id', callId)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
