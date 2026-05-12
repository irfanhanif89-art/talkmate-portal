import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Onboarding wizard ↔ canonical-business sync.
//
// THE BUG THIS FIXES (May 2026 — GM Towing).
// The wizard used to read state from a Zustand+localStorage store only,
// and the admin-created `notifications_config` blob never made it into
// the wizard. So when admin entered a client's services / hours / FAQs
// via the create-client modal, the client logged in and saw a blank
// wizard — losing trust on day one.
//
// ── Field map (canonical → wizard responses key) ────────────────────
// businesses.name              → responses.businessName
// businesses.phone_number      → responses.phone
// businesses.address           → responses.address
// businesses.website           → responses.website
// businesses.abn               → responses.abn
// businesses.industry          → responses.industry
// businesses.timezone          → responses.timezone
// businesses.opening_hours OR  → responses.openingHours
//   notifications_config.opening_hours
// notifications_config.services             → responses.catalog
// notifications_config.faqs                 → responses.faqs
// notifications_config.after_hours_instruction
//   OR escalation_rules                     → responses.escalationRules
// notifications_config.agent_answer_phrase  → responses.greeting
// notifications_config.voice_id             → responses.voice
// notifications_config.{notification_email, email_on_transfer,
//   daily_summary, weekly_report, whatsapp, whatsapp_number,
//   urgent_call, urgent_call_number}        → responses.notifications.{...}
//
// Wizard work-in-progress (anything previously saved into
// onboarding_responses.responses[X]) ALWAYS wins over the canonical
// fallback for that key — otherwise re-opening the wizard would clobber
// the user's edits.
//
// The POST handler does the reverse mirror so admin sees the same data
// the wizard last saved.

interface NotificationsConfig {
  opening_hours?: Record<string, unknown>
  services?: unknown[]
  faqs?: unknown[]
  after_hours_instruction?: string
  escalation_rules?: string
  agent_answer_phrase?: string
  voice_id?: string
  notification_email?: string
  email_on_transfer?: boolean
  daily_summary?: boolean
  weekly_report?: boolean
  whatsapp?: boolean
  whatsapp_number?: string
  urgent_call?: boolean
  urgent_call_number?: string
  [key: string]: unknown
}

interface BusinessRow {
  id: string
  name: string | null
  phone_number: string | null
  address: string | null
  website: string | null
  abn: string | null
  industry: string | null
  timezone: string | null
  business_type: string | null
  opening_hours: Record<string, unknown> | null
  notifications_config: NotificationsConfig | null
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v as object).length === 0
  return false
}

// Build a wizard `responses` blob by overlaying saved wizard responses
// on top of the canonical sources.
function buildMergedResponses(business: BusinessRow, savedResponses: Record<string, unknown>) {
  const cfg = (business.notifications_config ?? {}) as NotificationsConfig
  const merged: Record<string, unknown> = { ...savedResponses }

  // Top-level businesses columns → wizard keys.
  const colMap: Array<[keyof BusinessRow, string]> = [
    ['name', 'businessName'],
    ['phone_number', 'phone'],
    ['address', 'address'],
    ['website', 'website'],
    ['abn', 'abn'],
    ['industry', 'industry'],
    ['timezone', 'timezone'],
  ]
  for (const [col, key] of colMap) {
    if (isEmpty(merged[key]) && !isEmpty(business[col])) merged[key] = business[col]
  }

  // Opening hours: prefer top-level column, fall back to nc.opening_hours.
  if (isEmpty(merged.openingHours)) {
    if (!isEmpty(business.opening_hours)) merged.openingHours = business.opening_hours
    else if (!isEmpty(cfg.opening_hours)) merged.openingHours = cfg.opening_hours
  }

  // Services / catalog. Admin's services entries already use
  // {name, category, price, description} — same shape as the wizard's
  // CatalogRow — but never carry `prefilled: true`, so the green
  // "library default" stripe correctly only appears for INDUSTRY_LIBRARY
  // seeds.
  if (isEmpty(merged.catalog) && !isEmpty(cfg.services)) {
    merged.catalog = cfg.services
  }

  if (isEmpty(merged.faqs) && !isEmpty(cfg.faqs)) {
    merged.faqs = cfg.faqs
  }

  if (isEmpty(merged.escalationRules)) {
    if (!isEmpty(cfg.after_hours_instruction)) merged.escalationRules = cfg.after_hours_instruction
    else if (!isEmpty(cfg.escalation_rules)) merged.escalationRules = cfg.escalation_rules
  }

  if (isEmpty(merged.greeting) && !isEmpty(cfg.agent_answer_phrase)) {
    merged.greeting = cfg.agent_answer_phrase
  }

  if (isEmpty(merged.voice) && !isEmpty(cfg.voice_id)) {
    merged.voice = cfg.voice_id
  }

  // Notifications: only synthesize from nc when the wizard hasn't saved
  // its own notifications object yet. (The wizard manages this whole
  // object as a unit, so a partial overlay would surprise the user.)
  if (isEmpty(merged.notifications)) {
    const hasAny =
      cfg.notification_email !== undefined ||
      cfg.email_on_transfer !== undefined ||
      cfg.daily_summary !== undefined ||
      cfg.weekly_report !== undefined ||
      cfg.whatsapp !== undefined ||
      cfg.whatsapp_number !== undefined ||
      cfg.urgent_call !== undefined ||
      cfg.urgent_call_number !== undefined
    if (hasAny) {
      merged.notifications = {
        email: cfg.notification_email ?? '',
        emailOnTransfer: cfg.email_on_transfer ?? true,
        dailySummary: cfg.daily_summary ?? true,
        weeklyReport: cfg.weekly_report ?? true,
        whatsapp: cfg.whatsapp ?? false,
        whatsappNum: cfg.whatsapp_number ?? '',
        // Admin doesn't capture telegram — leave defaults.
        telegram: false,
        telegramUser: '',
        urgentCall: cfg.urgent_call ?? false,
        urgentNum: cfg.urgent_call_number ?? '',
      }
    }
  }

  return merged
}

const BUSINESS_SELECT =
  'id, name, phone_number, address, website, abn, industry, timezone, business_type, opening_hours, notifications_config, plan, onboarded_by, account_status, talkmate_number'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { data: business, error } = await supabase
    .from('businesses')
    .select(BUSINESS_SELECT)
    .eq('owner_user_id', user.id)
    .single()
  if (error || !business) {
    return NextResponse.json({ ok: false, error: 'Business not found' }, { status: 404 })
  }

  const { data: onboardingRow } = await supabase
    .from('onboarding_responses')
    .select('responses, current_step, completed_at')
    .eq('business_id', business.id)
    .maybeSingle()

  const saved = (onboardingRow?.responses ?? {}) as Record<string, unknown>
  const merged = buildMergedResponses(business as BusinessRow, saved)

  // Plan / onboarded_by / account_status surfaced so the wizard can:
  //   - show the right monthly price on the payment step
  //   - skip the payment step entirely for admin-created active clients
  //     (their payment was handled externally before they ever logged in)
  const bizExtras = business as unknown as {
    plan?: string | null
    onboarded_by?: string | null
    account_status?: string | null
  }
  const bizWithNumber = business as unknown as {
    plan?: string | null
    onboarded_by?: string | null
    account_status?: string | null
    talkmate_number?: string | null
  }
  return NextResponse.json({
    ok: true,
    business_id: business.id,
    business_type: business.business_type ?? 'other',
    plan: bizExtras.plan ?? 'starter',
    onboarded_by: bizExtras.onboarded_by ?? null,
    account_status: bizExtras.account_status ?? null,
    talkmate_number: bizWithNumber.talkmate_number ?? null,
    current_step: onboardingRow?.current_step ?? 1,
    completed_at: onboardingRow?.completed_at ?? null,
    responses: merged,
  })
}

interface NotificationsBlob {
  email?: string
  emailOnTransfer?: boolean
  dailySummary?: boolean
  weeklyReport?: boolean
  whatsapp?: boolean
  whatsappNum?: string
  urgentCall?: boolean
  urgentNum?: string
}

interface CatalogRow {
  name?: string
  category?: string
  price?: string
  description?: string
  prefilled?: boolean
}

interface SaveBody {
  current_step?: number
  responses?: Record<string, unknown>
}

// POST — persist wizard state and mirror back to canonical fields so
// the admin Edit modal sees the same data.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  let body: SaveBody = {}
  try { body = await req.json() } catch {}
  const responses = (body.responses ?? {}) as Record<string, unknown>
  const currentStep = typeof body.current_step === 'number' ? body.current_step : 1

  const { data: business, error: bizErr } = await supabase
    .from('businesses')
    .select('id, notifications_config')
    .eq('owner_user_id', user.id)
    .single()
  if (bizErr || !business) {
    return NextResponse.json({ ok: false, error: 'Business not found' }, { status: 404 })
  }

  // 1. Persist the wizard's working buffer.
  const { error: respErr } = await supabase
    .from('onboarding_responses')
    .upsert(
      { business_id: business.id, current_step: currentStep, responses },
      { onConflict: 'business_id' },
    )
  if (respErr) {
    return NextResponse.json({ ok: false, error: respErr.message }, { status: 500 })
  }

  // 2. Mirror to canonical businesses columns. Only mirror fields the
  //    wizard actually touched — never overwrite an admin-set value with
  //    a blank one. (`prefilled` rows from INDUSTRY_LIBRARY are filtered
  //    so they don't end up presented as the client's real services.)
  const businessUpdate: Record<string, unknown> = {}
  if (typeof responses.businessName === 'string' && responses.businessName.trim()) {
    businessUpdate.name = responses.businessName.trim()
  }
  if (typeof responses.phone === 'string' && responses.phone.trim()) {
    businessUpdate.phone_number = responses.phone.trim()
  }
  if (typeof responses.address === 'string' && responses.address.trim()) {
    businessUpdate.address = responses.address.trim()
  }
  if (typeof responses.website === 'string' && responses.website.trim()) {
    businessUpdate.website = responses.website.trim()
  }
  if (typeof responses.abn === 'string' && responses.abn.trim()) {
    businessUpdate.abn = responses.abn.trim()
  }
  if (typeof responses.industry === 'string' && responses.industry.trim()) {
    businessUpdate.industry = responses.industry.trim()
  }
  if (typeof responses.timezone === 'string' && responses.timezone.trim()) {
    businessUpdate.timezone = responses.timezone.trim()
  }
  if (responses.openingHours && typeof responses.openingHours === 'object'
      && !Array.isArray(responses.openingHours)
      && Object.keys(responses.openingHours as object).length > 0) {
    businessUpdate.opening_hours = responses.openingHours
  }

  // 3. Mirror to notifications_config (merge — never overwrite the
  //    whole blob).
  const cfg = { ...((business.notifications_config ?? {}) as NotificationsConfig) }
  let cfgChanged = false

  if (typeof responses.greeting === 'string' && responses.greeting.trim()) {
    cfg.agent_answer_phrase = responses.greeting.trim()
    cfgChanged = true
  }
  if (typeof responses.voice === 'string' && responses.voice.trim()) {
    cfg.voice_id = responses.voice.trim()
    cfgChanged = true
  }
  if (typeof responses.escalationRules === 'string' && responses.escalationRules.trim()) {
    cfg.after_hours_instruction = responses.escalationRules.trim()
    cfgChanged = true
  }
  if (Array.isArray(responses.faqs)) {
    cfg.faqs = (responses.faqs as Array<Record<string, unknown>>).map(f => ({
      question: f.question, answer: f.answer,
    }))
    cfgChanged = true
  }
  if (Array.isArray(responses.catalog)) {
    cfg.services = (responses.catalog as CatalogRow[])
      // Drop empty rows so we don't pollute the admin view with blanks.
      .filter(r => (r.name ?? '').trim() !== '')
      .map(r => ({
        name: r.name, category: r.category,
        price: r.price, description: r.description,
      }))
    cfgChanged = true
  }
  if (responses.openingHours && typeof responses.openingHours === 'object'
      && !Array.isArray(responses.openingHours)
      && Object.keys(responses.openingHours as object).length > 0) {
    cfg.opening_hours = responses.openingHours as Record<string, unknown>
    cfgChanged = true
  }
  if (responses.notifications && typeof responses.notifications === 'object') {
    const n = responses.notifications as NotificationsBlob
    if (typeof n.email === 'string') { cfg.notification_email = n.email; cfgChanged = true }
    if (typeof n.emailOnTransfer === 'boolean') { cfg.email_on_transfer = n.emailOnTransfer; cfgChanged = true }
    if (typeof n.dailySummary === 'boolean') { cfg.daily_summary = n.dailySummary; cfgChanged = true }
    if (typeof n.weeklyReport === 'boolean') { cfg.weekly_report = n.weeklyReport; cfgChanged = true }
    if (typeof n.whatsapp === 'boolean') { cfg.whatsapp = n.whatsapp; cfgChanged = true }
    if (typeof n.whatsappNum === 'string') { cfg.whatsapp_number = n.whatsappNum; cfgChanged = true }
    if (typeof n.urgentCall === 'boolean') { cfg.urgent_call = n.urgentCall; cfgChanged = true }
    if (typeof n.urgentNum === 'string') { cfg.urgent_call_number = n.urgentNum; cfgChanged = true }
  }

  if (cfgChanged) businessUpdate.notifications_config = cfg

  if (Object.keys(businessUpdate).length > 0) {
    const { error: updErr } = await supabase
      .from('businesses')
      .update(businessUpdate)
      .eq('id', business.id)
    if (updErr) {
      // Non-fatal — onboarding_responses already saved.
      console.error('[onboarding/state] business mirror update failed', updErr)
    }
  }

  return NextResponse.json({ ok: true })
}
