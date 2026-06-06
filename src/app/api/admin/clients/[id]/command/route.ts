// Admin endpoints for managing a client's TalkMate Command bot.
//
// POST   /api/admin/clients/[id]/command         — create the pending
//                                                  command_bots record
//                                                  (manual fallback when
//                                                  activation didn't run).
// PATCH  /api/admin/clients/[id]/command         — paste the BotFather
//                                                  token + set webhook.
//                                                  Body: { botToken }
//
// Both routes require admin auth via requireAdmin().

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/server'
import { createTelegramBotForClient, finaliseTelegramBot } from '@/lib/telegram-bot-creator'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses')
    .select('name')
    .eq('id', id)
    .maybeSingle()
  if (!biz) return NextResponse.json({ ok: false, error: 'business not found' }, { status: 404 })

  const result = await createTelegramBotForClient({
    clientId: id,
    businessName: biz.name ?? 'Client',
  })

  return NextResponse.json({ ok: result.status !== 'failed', result })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { botToken?: string }
  const botToken = (body.botToken ?? '').trim()
  if (!botToken || !/^\d+:[A-Za-z0-9_-]+$/.test(botToken)) {
    return NextResponse.json({ ok: false, error: 'botToken looks invalid' }, { status: 400 })
  }

  // Pick a stable base URL. NEXT_PUBLIC_APP_URL or VERCEL_URL works in
  // both environments; fall back to the request origin so local testing
  // doesn't require additional env vars.
  const publicBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    ?? new URL(req.url).origin

  const result = await finaliseTelegramBot({ clientId: id, botToken, publicBaseUrl })
  return NextResponse.json(result)
}
