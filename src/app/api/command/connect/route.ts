import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/command/connect  body: { platform, token }
// Stores the WhatsApp/Telegram token on the business record.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { platform, token } = (await req.json().catch(() => ({}))) as { platform?: string; token?: string }
  if (!platform || !token) return NextResponse.json({ ok: false, error: 'platform and token required' }, { status: 400 })
  if (platform !== 'whatsapp' && platform !== 'telegram') {
    return NextResponse.json({ ok: false, error: 'platform must be whatsapp or telegram' }, { status: 400 })
  }

  const { error } = await supabase.from('businesses')
    .update({ command_centre_platform: platform, command_centre_token: token })
    .eq('owner_user_id', user.id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
