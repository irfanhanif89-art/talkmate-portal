import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// Session 14 — Google Maps distance quoting.
//
// This route is server-side ONLY. It uses GOOGLE_MAPS_SERVER_KEY (no
// NEXT_PUBLIC_ prefix) which is enabled for Geocoding + Distance Matrix.
// Never expose the key to the browser; never log it.
//
// Caller contract: /api/vapi/functions invokes this route internally with
// an x-internal-secret header matching INTERNAL_API_SECRET (falls back to
// VAPI_WEBHOOK_SECRET so production already has a value to gate on).
//
// Response shape is fixed — the Vapi function relies on it.

interface DistanceRequest {
  origin: string
  destination: string
  client_id: string
}

interface DistanceResponse {
  success: boolean
  origin_resolved?: string
  destination_resolved?: string
  origin_lat?: number
  origin_lng?: number
  destination_lat?: number
  destination_lng?: number
  distance_km?: number
  duration_minutes?: number
  within_service_area?: boolean
  origin_confidence?: 'high' | 'low'
  destination_confidence?: 'high' | 'low'
  error?: string
}

const GEOCODE_BASE = 'https://maps.googleapis.com/maps/api/geocode/json'
const DISTANCE_BASE = 'https://maps.googleapis.com/maps/api/distancematrix/json'

// 8 s per upstream call. The Vapi function-call budget is ~3 s so we
// actually want to fail fast — Distance Matrix usually returns in ~400 ms.
// AbortController guards against the Google API hanging.
const UPSTREAM_TIMEOUT_MS = 8000

export async function POST(request: Request) {
  // ---- auth ------------------------------------------------------------
  const expected = process.env.INTERNAL_API_SECRET || process.env.VAPI_WEBHOOK_SECRET
  if (expected) {
    const got =
      request.headers.get('x-internal-secret') ??
      request.headers.get('x-vapi-secret') ??
      request.headers.get('authorization') ??
      ''
    const normalized = got.startsWith('Bearer ') ? got.slice(7) : got
    if (normalized !== expected) {
      return NextResponse.json<DistanceResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }
  }

  // ---- env -------------------------------------------------------------
  const mapsKey = process.env.GOOGLE_MAPS_SERVER_KEY
  if (!mapsKey) {
    return NextResponse.json<DistanceResponse>(
      { success: false, error: 'Maps service not configured' },
      { status: 500 },
    )
  }

  // ---- body ------------------------------------------------------------
  let body: DistanceRequest
  try {
    body = (await request.json()) as DistanceRequest
  } catch {
    return NextResponse.json<DistanceResponse>({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }
  const origin = (body.origin ?? '').trim()
  const destination = (body.destination ?? '').trim()
  const clientId = (body.client_id ?? '').trim()
  if (!origin || !destination || !clientId) {
    return NextResponse.json<DistanceResponse>(
      { success: false, error: 'origin, destination, client_id required' },
      { status: 400 },
    )
  }

  // ---- geocode origin + destination in parallel ----------------------
  try {
    const [originGeo, destGeo] = await Promise.all([
      geocode(origin, mapsKey),
      geocode(destination, mapsKey),
    ])

    if (!originGeo.ok || !destGeo.ok) {
      return NextResponse.json<DistanceResponse>({
        success: false,
        error: 'Could not resolve one or both addresses',
        origin_confidence: originGeo.ok ? originGeo.confidence : 'low',
        destination_confidence: destGeo.ok ? destGeo.confidence : 'low',
      })
    }

    // ---- distance matrix ---------------------------------------------
    const matrix = await distanceMatrix(originGeo, destGeo, mapsKey)
    if (!matrix.ok) {
      return NextResponse.json<DistanceResponse>({ success: false, error: matrix.error })
    }

    // ---- service area check ------------------------------------------
    const within = await isWithinServiceArea(clientId, originGeo, mapsKey)

    return NextResponse.json<DistanceResponse>({
      success: true,
      origin_resolved: originGeo.formatted,
      destination_resolved: destGeo.formatted,
      origin_lat: originGeo.lat,
      origin_lng: originGeo.lng,
      destination_lat: destGeo.lat,
      destination_lng: destGeo.lng,
      distance_km: matrix.distanceKm,
      duration_minutes: matrix.durationMinutes,
      within_service_area: within,
      origin_confidence: originGeo.confidence,
      destination_confidence: destGeo.confidence,
    })
  } catch (e) {
    console.error('[api/maps/distance] failure', e)
    return NextResponse.json<DistanceResponse>({
      success: false,
      error: 'Maps service unavailable',
    })
  }
}

// ────────────────────────── helpers ──────────────────────────────────

interface GeocodeOk {
  ok: true
  lat: number
  lng: number
  formatted: string
  confidence: 'high' | 'low'
  postcode: string | null
  suburb: string | null
}
interface GeocodeFail { ok: false; confidence: 'low' }
type GeocodeResult = GeocodeOk | GeocodeFail

async function geocode(address: string, key: string): Promise<GeocodeResult> {
  const url = `${GEOCODE_BASE}?address=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}&region=au&components=country:AU`
  const res = await fetchWithTimeout(url)
  if (!res.ok) return { ok: false, confidence: 'low' }
  const data = await res.json()
  if (data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
    return { ok: false, confidence: 'low' }
  }
  const r = data.results[0]
  const locationType: string = r.geometry?.location_type ?? 'APPROXIMATE'
  const confidence: 'high' | 'low' =
    locationType === 'ROOFTOP' || locationType === 'RANGE_INTERPOLATED' ? 'high' : 'low'
  const lat: number = r.geometry?.location?.lat
  const lng: number = r.geometry?.location?.lng
  if (typeof lat !== 'number' || typeof lng !== 'number') return { ok: false, confidence: 'low' }

  const comps = (r.address_components ?? []) as Array<{ short_name: string; long_name: string; types: string[] }>
  const postcode = comps.find(c => c.types.includes('postal_code'))?.short_name ?? null
  const suburb = comps.find(c => c.types.includes('locality'))?.long_name
    ?? comps.find(c => c.types.includes('sublocality'))?.long_name
    ?? null

  return {
    ok: true,
    lat, lng,
    formatted: r.formatted_address as string,
    confidence,
    postcode,
    suburb,
  }
}

interface MatrixOk { ok: true; distanceKm: number; durationMinutes: number }
interface MatrixFail { ok: false; error: string }
type MatrixResult = MatrixOk | MatrixFail

async function distanceMatrix(origin: GeocodeOk, dest: GeocodeOk, key: string): Promise<MatrixResult> {
  const params = new URLSearchParams({
    origins: `${origin.lat},${origin.lng}`,
    destinations: `${dest.lat},${dest.lng}`,
    departure_time: 'now',
    traffic_model: 'best_guess',
    region: 'au',
    units: 'metric',
    key,
  })
  const res = await fetchWithTimeout(`${DISTANCE_BASE}?${params.toString()}`)
  if (!res.ok) return { ok: false, error: 'Distance Matrix request failed' }
  const data = await res.json()
  if (data.status !== 'OK') return { ok: false, error: `Distance Matrix status: ${data.status}` }
  const element = data.rows?.[0]?.elements?.[0]
  if (!element || element.status !== 'OK') {
    return { ok: false, error: 'No route between addresses' }
  }
  const meters: number = element.distance?.value ?? 0
  const seconds: number = element.duration_in_traffic?.value ?? element.duration?.value ?? 0
  return {
    ok: true,
    distanceKm: Math.round((meters / 1000) * 100) / 100,
    durationMinutes: Math.ceil(seconds / 60),
  }
}

interface ServiceAreaRow {
  service_area_mode: string | null
  service_area_radius: number | null
  service_area_postcodes: unknown
  business_address: string | null
  address: string | null
}

async function isWithinServiceArea(
  clientId: string,
  origin: GeocodeOk,
  mapsKey: string,
): Promise<boolean> {
  const supabase = createAdminClient()
  // Brief rule: never use .single() on businesses. Use maybeSingle().
  const { data: biz } = await supabase
    .from('businesses')
    .select('service_area_mode, service_area_radius, service_area_postcodes, business_address, address')
    .eq('id', clientId)
    .maybeSingle()

  const row = (biz ?? {}) as ServiceAreaRow
  const mode = row.service_area_mode ?? 'radius'

  if (mode === 'postcodes') {
    const list = Array.isArray(row.service_area_postcodes)
      ? (row.service_area_postcodes as unknown[]).map(v => String(v).toLowerCase().trim()).filter(Boolean)
      : []
    if (list.length === 0) return true
    const haystacks = [
      origin.formatted.toLowerCase(),
      origin.postcode?.toLowerCase() ?? '',
      origin.suburb?.toLowerCase() ?? '',
    ]
    return list.some(needle => haystacks.some(h => h.includes(needle)))
  }

  // radius mode (default)
  const radiusKm = Math.max(1, row.service_area_radius ?? 100)
  const baseAddress = (row.business_address ?? row.address ?? '').trim()
  if (!baseAddress) return true // no base address configured — don't block

  const baseGeo = await geocode(baseAddress, mapsKey)
  if (!baseGeo.ok) return true // base address unresolvable — don't block

  const km = haversineKm(baseGeo.lat, baseGeo.lng, origin.lat, origin.lng)
  return km <= radiusKm
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}
