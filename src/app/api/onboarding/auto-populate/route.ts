// Session 4A (Round 1) — Auto-populate onboarding from Google Maps + website.
// SAFETY: returns SUGGESTIONS ONLY. Writes nothing to businesses or
// knowledge_base_entries. The owner confirms in Step 0B before anything saves.
// Website fetch goes through the SSRF-safe helper. Never throws on a data
// failure — returns partial results with confidence 'low'.

import { NextResponse } from 'next/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { grokJson } from '@/lib/grok'
import { safeFetchText, htmlToText } from '@/lib/safe-fetch'
import { mapPlaceTypesToIndustry } from '@/lib/onboarding-intel'

export const runtime = 'nodejs'

interface PlaceResult {
  name?: string
  formatted_address?: string
  formatted_phone_number?: string
  website?: string
  opening_hours?: { weekday_text?: string[] }
  types?: string[]
  business_status?: string
}

interface ExtractedSite {
  services?: string[]
  faqs?: { q: string; a: string }[]
  ownerName?: string | null
  serviceArea?: string | null
  pricing?: string | null
}

interface KbSuggestion {
  category: 'faq' | 'service' | 'hours' | 'pricing' | 'custom'
  question: string
  answer: string
}

const MAPS_KEY = () => process.env.GOOGLE_MAPS_SERVER_KEY

function looksLikeUrl(s: string): boolean {
  return /^(https?:\/\/|www\.)/i.test(s) || /\.[a-z]{2,}(\/|$)/i.test(s)
}
function isMapsUrl(s: string): boolean {
  return /maps\.google\.|g\.co\/maps|goo\.gl\/maps|maps\.app\.goo\.gl/i.test(s)
}

// Google Places: text search -> place details (for opening hours + website).
async function lookupPlace(query: string): Promise<PlaceResult | null> {
  const key = MAPS_KEY()
  if (!key) return null
  try {
    const findUrl =
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id&key=${key}`
    const findRes = await fetch(findUrl, { signal: AbortSignal.timeout(5000) })
    if (!findRes.ok) return null
    const find = await findRes.json() as { candidates?: { place_id?: string }[] }
    const placeId = find.candidates?.[0]?.place_id
    if (!placeId) return null

    const fields = 'name,formatted_address,opening_hours,formatted_phone_number,website,types,business_status'
    const detUrl =
      `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${key}`
    const detRes = await fetch(detUrl, { signal: AbortSignal.timeout(5000) })
    if (!detRes.ok) return null
    const det = await detRes.json() as { result?: PlaceResult }
    return det.result ?? null
  } catch {
    return null
  }
}

async function extractFromWebsite(url: string): Promise<ExtractedSite | null> {
  try {
    const html = await safeFetchText(url)
    const text = htmlToText(html, 3000)
    if (text.length < 40) return null
    const data = await grokJson<ExtractedSite>([
      {
        role: 'system',
        content:
          'You extract structured business facts from website text for an Australian small business. ' +
          'Return ONLY JSON. Do not invent facts that are not present. Use casual Australian English in answers. Never use em dashes.',
      },
      {
        role: 'user',
        content:
          `Extract from this business website text:\n` +
          `1. services offered (max 8)\n2. 5-8 FAQs a customer would ask, with natural answers\n` +
          `3. the owner or manager first name if mentioned, else null\n4. the service area or location, else null\n` +
          `5. any pricing mentioned, else null\n\n` +
          `Return JSON: {"services":string[],"faqs":[{"q":string,"a":string}],"ownerName":string|null,"serviceArea":string|null,"pricing":string|null}\n\n` +
          `WEBSITE TEXT:\n${text}`,
      },
    ], { maxTokens: 1500 })
    return data
  } catch {
    return null
  }
}

function buildSuggestions(place: PlaceResult | null, site: ExtractedSite | null): KbSuggestion[] {
  const out: KbSuggestion[] = []
  const services = site?.services ?? []
  for (const s of services.slice(0, 8)) {
    if (!s?.trim()) continue
    out.push({ category: 'service', question: `Tell me about your ${s.trim()} service`, answer: `Yes, we offer ${s.trim()}. Let me know what you need and I can take your details.` })
  }
  for (const f of (site?.faqs ?? []).slice(0, 8)) {
    if (!f?.q?.trim() || !f?.a?.trim()) continue
    out.push({ category: 'faq', question: f.q.trim(), answer: f.a.trim() })
  }
  const hours = place?.opening_hours?.weekday_text
  if (hours && hours.length > 0) {
    out.push({ category: 'hours', question: 'What are your business hours?', answer: hours.join('. ') })
  }
  if (site?.pricing?.trim()) {
    out.push({ category: 'pricing', question: 'How much do you charge?', answer: site.pricing.trim() })
  }
  return out
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const adminClientId = url.searchParams.get('adminClientId')
  const resolved = await resolveBusinessId(adminClientId, req)
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  let body: { input?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  const input = (body.input ?? '').trim()
  if (!input) return NextResponse.json({ error: 'input required' }, { status: 400 })

  // 1. Decide the place query + any directly supplied website.
  let placeQuery = input
  let directWebsite: string | null = null
  if (looksLikeUrl(input) && !isMapsUrl(input)) {
    const normalised = input.startsWith('http') ? input : `https://${input}`
    directWebsite = normalised
    try { placeQuery = new URL(normalised).hostname.replace(/^www\./, '') } catch { /* keep input */ }
  }

  // 2. Google Places (best-effort).
  const place = await lookupPlace(placeQuery)

  // 3. Website extraction (best-effort, SSRF-guarded).
  const websiteUrl = directWebsite || place?.website || null
  const site = websiteUrl ? await extractFromWebsite(websiteUrl) : null

  // 4. Assemble.
  const industry = mapPlaceTypesToIndustry(place?.types)
  const businessName = place?.name ?? (looksLikeUrl(input) ? '' : input.split(',')[0].trim())
  const ownerName = site?.ownerName ?? null
  const suggestedKbEntries = buildSuggestions(place, site)

  const hasMaps = !!place
  const hasSite = !!site
  const confidence: 'high' | 'medium' | 'low' =
    hasMaps && hasSite ? 'high' : hasMaps ? 'medium' : 'low'

  return NextResponse.json({
    businessName: businessName || null,
    phone: place?.formatted_phone_number ?? null,
    address: place?.formatted_address ?? null,
    industry,
    ownerName,
    websiteUrl,
    hours: place?.opening_hours?.weekday_text?.join('. ') ?? null,
    serviceArea: site?.serviceArea ?? null,
    suggestedKbEntries,
    confidence,
    source: { googleMaps: hasMaps, website: hasSite },
  })
}
