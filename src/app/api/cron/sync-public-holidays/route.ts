import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/server'

// Runs annually (January 1) plus on-demand. Pulls current + next year of
// Australian public holidays from data.gov.au and upserts into
// public_holidays. National holidays are fanned out into one row per
// state so the scheduler can do `where state = $1` cleanly.

const DATA_GOV_URL =
  'https://data.gov.au/data/api/3/action/datastore_search?resource_id=33673aca-0857-42e5-b8f0-9981b4755686&limit=500'

const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const
type StateCode = typeof STATES[number]

interface HolidayRecord {
  Date?: string | number
  'Holiday Name'?: string
  Jurisdiction?: string
  [k: string]: unknown
}

interface UpsertRow {
  state: StateCode
  holiday_name: string
  holiday_date: string
  year: number
  is_national: boolean
}

function parseDate(raw: string | number | undefined): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  // data.gov.au returns YYYYMMDD as a string. Be permissive about
  // ISO-like values too in case the resource format changes.
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10)
  }
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

function mapJurisdictions(raw: string | undefined): StateCode[] {
  if (!raw) return []
  const lower = raw.toLowerCase().trim()
  if (lower === 'nat' || lower === 'national' || lower === 'aus') return [...STATES]
  const map: Record<string, StateCode> = {
    nsw: 'NSW', vic: 'VIC', qld: 'QLD', wa: 'WA',
    sa: 'SA', tas: 'TAS', act: 'ACT', nt: 'NT',
  }
  // Some records have multiple jurisdictions comma-separated.
  return lower.split(/[,/]/).map(tok => map[tok.trim()]).filter(Boolean) as StateCode[]
}

export async function GET(request: Request) {
  const auth = verifyCron(request)
  if (auth) return auth

  const supabase = createAdminClient()
  let allRecords: HolidayRecord[] = []
  let inserted = 0
  let updated = 0

  try {
    const res = await fetch(DATA_GOV_URL, { headers: { 'Accept': 'application/json' } })
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `data.gov.au returned ${res.status}` }, { status: 502 })
    }
    const json = await res.json()
    const records = (json?.result?.records ?? []) as HolidayRecord[]
    allRecords = records
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 })
  }

  const thisYear = new Date().getFullYear()
  const yearsAllowed = new Set([thisYear, thisYear + 1])
  const rows: UpsertRow[] = []
  for (const r of allRecords) {
    const isoDate = parseDate(r.Date)
    if (!isoDate) continue
    const year = Number(isoDate.slice(0, 4))
    if (!yearsAllowed.has(year)) continue
    const states = mapJurisdictions(r.Jurisdiction)
    if (states.length === 0) continue
    const name = String(r['Holiday Name'] ?? '').trim()
    if (!name) continue
    const isNational = String(r.Jurisdiction ?? '').toLowerCase().trim() === 'nat' || states.length === STATES.length
    for (const state of states) {
      rows.push({ state, holiday_name: name, holiday_date: isoDate, year, is_national: isNational })
    }
  }

  // Upsert in chunks to keep the request size sensible.
  const CHUNK = 200
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error, count } = await supabase
      .from('public_holidays')
      .upsert(slice, { onConflict: 'state,holiday_date', count: 'exact' })
    if (error) {
      console.error('[cron/sync-public-holidays] upsert failed', error.message)
      continue
    }
    inserted += count ?? slice.length
  }
  updated = rows.length - inserted

  return NextResponse.json({ ok: true, records_seen: allRecords.length, rows_upserted: rows.length, inserted, updated })
}

export const POST = GET
