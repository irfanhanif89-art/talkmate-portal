import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { grokJson, GrokError } from '@/lib/grok'

interface ImportedItem {
  name: string
  price: number | null
  category: string
  description?: string
}

const VALID_CATEGORIES = ['Mains', 'Sides', 'Drinks', 'Desserts', 'Specials', 'Services', 'Other']
const FETCH_TIMEOUT_MS = 12_000
const USER_AGENT = 'Mozilla/5.0 (compatible; TalkMatePortal/1.0; +https://app.talkmate.com.au)'

async function fetchPageText(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
      signal: controller.signal,
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`Fetch ${res.status}`)
    const html = await res.text()
    // Strip scripts/styles, then collapse tags to spaces.
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim()
    return text.slice(0, 18_000) // cap at ~18k chars to control Grok cost
  } finally {
    clearTimeout(timer)
  }
}

// POST /api/menu-import { url, jobId? }
// Scrapes the URL, sends to Grok, returns parsed items + a job id.
// Brief Part 6: URL-only MVP, no Vercel Blob, no Vision API.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { data: business } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
  if (!business) return NextResponse.json({ ok: false, error: 'No business' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const url: string | undefined = body.url
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ ok: false, error: 'Provide a valid http(s) URL' }, { status: 400 })
  }

  // Create job row
  const { data: job, error: jobErr } = await supabase.from('menu_import_jobs').insert({
    business_id: business.id,
    user_id: user.id,
    source_type: 'url',
    source_url: url,
    status: 'processing',
  }).select('id').single()

  if (jobErr || !job) {
    return NextResponse.json({ ok: false, error: 'Could not start job' }, { status: 500 })
  }

  let pageText = ''
  try {
    pageText = await fetchPageText(url)
  } catch (e) {
    await supabase.from('menu_import_jobs').update({
      status: 'failed', error: 'fetch_failed', completed_at: new Date().toISOString(),
    }).eq('id', job.id)
    return NextResponse.json({
      ok: false,
      error: "We couldn't access that URL. Make sure it's publicly accessible or try a different link.",
    }, { status: 400 })
  }

  if (!pageText || pageText.length < 50) {
    await supabase.from('menu_import_jobs').update({
      status: 'failed', error: 'empty_page', completed_at: new Date().toISOString(),
    }).eq('id', job.id)
    return NextResponse.json({
      ok: false,
      error: "We couldn't find any content at that URL. Try pasting your menu page directly, or add items manually.",
    }, { status: 400 })
  }

  const prompt = `Extract every menu item and price from the following text. Return ONLY valid JSON, no other text:
{"items":[{"name":"Item name","price":12.50,"category":"Mains","description":"optional"}]}
If no price found for an item use null.
Categories must be one of: ${VALID_CATEGORIES.join(', ')}
TEXT:
${pageText}`

  try {
    const parsed = await grokJson<{ items: ImportedItem[] }>([
      { role: 'system', content: 'You are a menu extraction tool. You return only valid JSON in the schema requested.' },
      { role: 'user', content: prompt },
    ])

    const items = (parsed.items ?? []).filter(i => i && i.name).map(i => ({
      name: String(i.name).slice(0, 200),
      price: typeof i.price === 'number' && Number.isFinite(i.price) ? Math.round(i.price * 100) / 100 : null,
      category: VALID_CATEGORIES.includes(i.category as string) ? i.category : 'Other',
      description: i.description ? String(i.description).slice(0, 500) : undefined,
    }))

    await supabase.from('menu_import_jobs').update({
      status: 'done',
      raw_result: { items },
      items_found: items.length,
      completed_at: new Date().toISOString(),
    }).eq('id', job.id)

    if (items.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "We couldn't find any menu items at that URL. Try pasting your menu page directly, or add items manually.",
        jobId: job.id,
      }, { status: 200 })
    }

    return NextResponse.json({ ok: true, jobId: job.id, items })
  } catch (e) {
    const message = e instanceof GrokError
      ? 'Auto-import is temporarily unavailable. Please add items manually.'
      : 'Could not parse menu items. Please add them manually.'
    await supabase.from('menu_import_jobs').update({
      status: 'failed', error: (e as Error).message, completed_at: new Date().toISOString(),
    }).eq('id', job.id)
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
