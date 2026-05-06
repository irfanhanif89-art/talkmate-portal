'use client'

import { useState, useEffect, useRef } from 'react'
import { AdminBusiness, PartnerOption, PLAN_OPTIONS, planLabel } from './types'
import { INDUSTRY_LIBRARY } from '@/lib/industryLibrary'

// ── Types ────────────────────────────────────────────────────────────────────
interface HourEntry { open: string; close: string; closed: boolean }
interface ServiceRow { name: string; category: string; price: string; description: string }
interface FaqRow { question: string; answer: string }
interface CreatedResult { business: AdminBusiness; email: string; temp_password: string }

// ── Constants ────────────────────────────────────────────────────────────────
const VOICES = [
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie',          desc: 'Casual Aussie Male' },
  { id: 'snyKKuaGYk1VUEh42zbW', name: 'Chris',            desc: 'Friendly Aussie Male' },
  { id: '56bWURjYFHyYyVf490Dp', name: 'Emma',             desc: 'Warm Aussie Female' },
  { id: 'cvpTJfe9LINpHIOmB2Hp', name: 'Charlotte (Warm)', desc: 'Casual Aussie Female' },
  { id: 'gEdKKVxVhNCulBgRQ9GW', name: 'Charlotte (Pro)',  desc: 'Professional Aussie Female' },
]
const DEFAULT_VOICE_ID = 'IKne3meq5aSn9XLyUdCD' // Charlie

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// Library-aligned industry keys — used by this form and accepted by the API.
const INDUSTRIES: Array<{ value: string; label: string }> = [
  { value: 'restaurant',  label: 'Restaurant & Takeaway' },
  { value: 'towing',      label: 'Towing & Transport' },
  { value: 'realestate',  label: 'Real Estate' },
  { value: 'trades',      label: 'Trades & Services' },
  { value: 'healthcare',  label: 'Healthcare & Clinics' },
  { value: 'ndis',        label: 'NDIS Provider' },
  { value: 'retail',      label: 'Retail' },
  { value: 'dental',      label: 'Dental Practice' },
  { value: 'medispa',     label: 'Medi-Spa & Beauty' },
  { value: 'mechanic',    label: 'Mechanic & Automotive' },
  { value: 'physio',      label: 'Physio & Allied Health' },
  { value: 'accounting',  label: 'Accounting & Bookkeeping' },
  { value: 'cleaning',    label: 'Cleaning Services' },
  { value: 'pest',        label: 'Pest Control' },
  { value: 'landscaping', label: 'Landscaping & Gardens' },
  { value: 'other',       label: 'Other' },
]

const defaultHours: Record<string, HourEntry> = {
  Monday:    { open: '09:00', close: '17:00', closed: false },
  Tuesday:   { open: '09:00', close: '17:00', closed: false },
  Wednesday: { open: '09:00', close: '17:00', closed: false },
  Thursday:  { open: '09:00', close: '17:00', closed: false },
  Friday:    { open: '09:00', close: '17:00', closed: false },
  Saturday:  { open: '09:00', close: '13:00', closed: false },
  Sunday:    { open: '09:00', close: '13:00', closed: true  },
}

function mkEmptyServices(): ServiceRow[] {
  return [
    { name: '', category: '', price: '', description: '' },
    { name: '', category: '', price: '', description: '' },
    { name: '', category: '', price: '', description: '' },
  ]
}
function mkEmptyFaqs(): FaqRow[] {
  return [
    { question: '', answer: '' },
    { question: '', answer: '' },
    { question: '', answer: '' },
  ]
}

function applyGreeting(template: string, businessName: string): string {
  return template.replace(/\{\{businessName\}\}/g, businessName || 'us')
}

// ─────────────────────────────────────────────────────────────────────────────

export default function CreateClientModal({
  partners, onClose, onCreated,
}: {
  partners: PartnerOption[]
  onClose: () => void
  onCreated: (b: AdminBusiness) => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<CreatedResult | null>(null)
  const [paymentLinkBusy, setPaymentLinkBusy] = useState(false)
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null)

  // ── Section 1: Business details ──────────────────────────────────────────
  const [businessName, setBusinessName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [industry, setIndustry] = useState('restaurant')
  const [address, setAddress] = useState('')
  const [website, setWebsite] = useState('')
  const [abn, setAbn] = useState('')
  const [referredBy, setReferredBy] = useState('')

  // ── Section 2: Plan ──────────────────────────────────────────────────────
  const [plan, setPlan] = useState<'starter' | 'growth' | 'pro'>('growth')

  // ── Section 3: Services summary ──────────────────────────────────────────
  const [servicesSummary, setServicesSummary] = useState('')

  // ── Section 4: Receptionist setup ────────────────────────────────────────
  const [receptionistName, setReceptionistName] = useState('')
  const [answerPhrase, setAnswerPhrase] = useState('')
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID)

  // ── Section 5: Opening hours ─────────────────────────────────────────────
  const [hours, setHours] = useState<Record<string, HourEntry>>(defaultHours)

  // ── Section 6: Services catalog ──────────────────────────────────────────
  const [services, setServices] = useState<ServiceRow[]>(mkEmptyServices())

  // ── Section 7: FAQs ──────────────────────────────────────────────────────
  const [faqs, setFaqs] = useState<FaqRow[]>(mkEmptyFaqs())

  // ── Section 8: Escalation ────────────────────────────────────────────────
  const [afterHours, setAfterHours] = useState('')
  const [escalationNumber, setEscalationNumber] = useState('')

  // ── Section 9: Notifications ─────────────────────────────────────────────
  const [notifEmailOnTransfer, setNotifEmailOnTransfer] = useState(true)
  const [notifEmail, setNotifEmail] = useState('')
  const [notifDailySummary, setNotifDailySummary] = useState(true)
  const [notifWeeklyReport, setNotifWeeklyReport] = useState(true)
  const [notifWhatsapp, setNotifWhatsapp] = useState(false)
  const [notifWhatsappNum, setNotifWhatsappNum] = useState('')
  const [notifUrgentCall, setNotifUrgentCall] = useState(false)
  const [notifUrgentNum, setNotifUrgentNum] = useState('')

  // ── Final options ────────────────────────────────────────────────────────
  const [initialNote, setInitialNote] = useState('')
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true)

  // ── Industry pre-fill ────────────────────────────────────────────────────
  // Track which industry we last pre-filled for so subsequent renders for the
  // same industry don't overwrite the user's edits.
  const lastPrefilledIndustry = useRef<string | null>(null)

  useEffect(() => {
    if (!industry || industry === 'other') return
    if (lastPrefilledIndustry.current === industry) return
    const data = INDUSTRY_LIBRARY[industry]
    if (!data) { lastPrefilledIndustry.current = industry; return }

    setVoiceId(data.recommendedVoiceId)
    setAnswerPhrase(applyGreeting(data.greetingTemplate, businessName))
    setServices(data.services.map(s => ({
      name: s.name,
      category: s.category,
      price: s.priceRange ?? '',
      description: s.description,
    })))
    setFaqs(data.faqs.slice(0, 5).map(f => ({
      question: f.question,
      answer: f.answer,
    })))
    setAfterHours(data.escalationRules)
    lastPrefilledIndustry.current = industry
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [industry])

  // ── Helpers ──────────────────────────────────────────────────────────────
  function updateHour(day: string, field: keyof HourEntry, val: string | boolean) {
    setHours(h => ({ ...h, [day]: { ...h[day], [field]: val } }))
  }
  function updateService(i: number, field: keyof ServiceRow, val: string) {
    setServices(rows => { const r = [...rows]; r[i] = { ...r[i], [field]: val }; return r })
  }
  function addService() { setServices(r => [...r, { name: '', category: '', price: '', description: '' }]) }
  function removeService(i: number) { setServices(r => r.filter((_, j) => j !== i)) }

  function updateFaq(i: number, field: keyof FaqRow, val: string) {
    setFaqs(rows => { const r = [...rows]; r[i] = { ...r[i], [field]: val }; return r })
  }
  function addFaq() { setFaqs(r => [...r, { question: '', answer: '' }]) }
  function removeFaq(i: number) { setFaqs(r => r.filter((_, j) => j !== i)) }

  function prefillFromIndustry() {
    const data = INDUSTRY_LIBRARY[industry]
    if (!data) return
    setVoiceId(data.recommendedVoiceId)
    setAnswerPhrase(applyGreeting(data.greetingTemplate, businessName))
    setServices(data.services.map(s => ({
      name: s.name, category: s.category, price: s.priceRange ?? '', description: s.description,
    })))
    setFaqs(data.faqs.slice(0, 5).map(f => ({ question: f.question, answer: f.answer })))
    setAfterHours(data.escalationRules)
    lastPrefilledIndustry.current = industry
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function submit() {
    if (!businessName || !ownerName || !email || !phone || !answerPhrase || !servicesSummary || !afterHours) {
      setError('Please fill in all required fields (marked with *).')
      return
    }
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/admin/clients/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: businessName,
          owner_name: ownerName,
          email,
          phone,
          industry,
          address: address || undefined,
          website: website || undefined,
          abn: abn || undefined,
          plan,
          agent_answer_phrase: answerPhrase,
          services_summary: servicesSummary,
          after_hours_instruction: afterHours,
          referred_by: referredBy || undefined,
          initial_note: initialNote || undefined,
          send_welcome_email: sendWelcomeEmail,
          // New extended fields
          receptionist_name: receptionistName || undefined,
          voice_id: voiceId,
          opening_hours: hours,
          services,
          faqs,
          escalation_number: escalationNumber || undefined,
          notif_email_on_transfer: notifEmailOnTransfer,
          notification_email: notifEmail || undefined,
          notif_daily_summary: notifDailySummary,
          notif_weekly_report: notifWeeklyReport,
          notif_whatsapp: notifWhatsapp,
          notif_whatsapp_number: notifWhatsappNum || undefined,
          notif_urgent_call: notifUrgentCall,
          notif_urgent_number: notifUrgentNum || undefined,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        if (data.existing_business_id) {
          setError(`${data.error}. Existing business: ${data.existing_business_name ?? data.existing_business_id}`)
        } else {
          setError(data.error || 'Failed to create')
        }
        return
      }
      onCreated(data.business)
      setSuccess({ business: data.business, email, temp_password: data.business.temp_password ?? '' })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function generatePaymentLink() {
    if (!success) return
    setPaymentLinkBusy(true); setError(null)
    try {
      const res = await fetch(`/api/admin/clients/${success.business.id}/generate-payment-link`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed')
      setPaymentLinkUrl(data.url)
      try { await navigator.clipboard.writeText(data.url) } catch {}
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPaymentLinkBusy(false)
    }
  }

  // ── Success screen ───────────────────────────────────────────────────────
  if (success) {
    return (
      <ModalShell onClose={onClose}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(34,197,94,0.15)', border: '2px solid #22C55E',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, color: '#22C55E', marginBottom: 14,
          }}>✓</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', margin: 0 }}>
            Account created for {success.business.name}
          </h2>
        </div>

        <div style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 16 }}>
          <SuccessRow label="Login email" value={success.email} />
          <SuccessRow label="Temporary password" value={success.temp_password} mono />
          <SuccessRow label="Plan" value={planLabel(success.business.plan)} />
          <SuccessRow label="Status" value="Pending" badge="#F59E0B" />
        </div>

        {paymentLinkUrl && (
          <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#22C55E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Payment link (copied to clipboard)</p>
            <p style={{ fontSize: 12, color: 'white', wordBreak: 'break-all', fontFamily: 'monospace' }}>{paymentLinkUrl}</p>
          </div>
        )}

        {error && <ErrorBanner msg={error} />}

        <p style={{ fontSize: 13, color: '#7BAED4', lineHeight: 1.6, marginBottom: 18 }}>
          Their account is pending. Send the payment link by SMS along with their login details.
          Payment activates the account automatically.
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={generatePaymentLink} disabled={paymentLinkBusy} style={primaryBtn(paymentLinkBusy)}>
            {paymentLinkBusy ? 'Generating…' : (paymentLinkUrl ? 'Regenerate payment link' : 'Generate payment link')}
          </button>
          <button onClick={onClose} style={ghostBtn()}>Done</button>
        </div>
      </ModalShell>
    )
  }

  // ── The industry data helper for pre-fill banners ────────────────────────
  const industryData = INDUSTRY_LIBRARY[industry] ?? null

  return (
    <ModalShell onClose={onClose}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', margin: '0 0 4px 0' }}>Create new client</h2>
      <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 22 }}>
        Full phone-call onboarding — complete all sections so the account is ready from day one.
      </p>

      {/* ── SECTION 1: Business details ─────────────────────────────────── */}
      <SectionTitle>1 · Business details</SectionTitle>
      <FormGrid>
        <Field label="Business name *">
          <Input value={businessName} onChange={setBusinessName} />
        </Field>
        <Field label="Owner full name *">
          <Input value={ownerName} onChange={setOwnerName} />
        </Field>
        <Field label="Email *" hint="This becomes their login email">
          <Input value={email} onChange={setEmail} type="email" />
        </Field>
        <Field label="Phone *">
          <Input value={phone} onChange={setPhone} />
        </Field>
        <Field label="Industry *">
          <Select value={industry} onChange={setIndustry} options={INDUSTRIES} />
        </Field>
        <Field label="ABN">
          <Input value={abn} onChange={setAbn} />
        </Field>
        <Field label="Address">
          <Input value={address} onChange={setAddress} />
        </Field>
        <Field label="Website">
          <Input value={website} onChange={setWebsite} type="url" />
        </Field>
        <Field label="Referred by (partner)">
          <Select
            value={referredBy}
            onChange={setReferredBy}
            options={[{ value: '', label: '— None —' }, ...partners.map(p => ({ value: p.id, label: p.name }))]}
          />
        </Field>
      </FormGrid>

      {industryData && (
        <div style={{
          margin: '4px 0 18px', padding: '10px 14px',
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
          borderRadius: 10, fontSize: 13, color: '#22C55E',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span>Voice, greeting, services, FAQs &amp; escalation pre-filled for {industryData.label}</span>
          <button
            type="button"
            onClick={prefillFromIndustry}
            style={{
              background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)',
              color: '#22C55E', borderRadius: 6, padding: '4px 10px',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
              flexShrink: 0,
            }}
          >Reset pre-fill</button>
        </div>
      )}

      {/* ── SECTION 2: Plan ─────────────────────────────────────────────── */}
      <SectionTitle>2 · Plan</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 22 }}>
        {PLAN_OPTIONS.map(opt => {
          const selected = plan === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPlan(opt.value)}
              style={{
                padding: 16, borderRadius: 12, cursor: 'pointer',
                background: selected ? 'rgba(232,98,42,0.10)' : '#071829',
                border: `2px solid ${selected ? '#E8622A' : 'rgba(255,255,255,0.07)'}`,
                textAlign: 'left' as const, fontFamily: 'Outfit, sans-serif',
                position: 'relative' as const,
              }}
            >
              {opt.recommended && (
                <span style={{
                  position: 'absolute', top: -10, left: 14,
                  background: '#E8622A', color: 'white', fontSize: 10, fontWeight: 700,
                  padding: '3px 8px', borderRadius: 99,
                }}>RECOMMENDED</span>
              )}
              <p style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 4 }}>{opt.label}</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: selected ? '#E8622A' : '#4A9FE8' }}>
                ${opt.price}<span style={{ fontSize: 11, fontWeight: 500, color: '#7BAED4' }}>/mo</span>
              </p>
            </button>
          )
        })}
      </div>

      {/* ── SECTION 3: Services summary ─────────────────────────────────── */}
      <SectionTitle>3 · Services summary</SectionTitle>
      <Field label="Services summary *" hint="Plain English — the AI uses this to understand what the business does and answer general questions.">
        <TextArea value={servicesSummary} onChange={setServicesSummary} rows={3}
          placeholder="e.g. We're a plumbing and electrical company serving the Gold Coast. We do emergency callouts 24/7, general repairs, hot water systems, and safety inspections." />
      </Field>
      <Divider />

      {/* ── SECTION 4: Receptionist setup ───────────────────────────────── */}
      <SectionTitle>4 · Receptionist setup</SectionTitle>
      <FormGrid>
        <Field label="Receptionist name" hint="What the AI agent calls itself, e.g. 'Sarah'">
          <Input value={receptionistName} onChange={setReceptionistName} placeholder="e.g. Sarah" />
        </Field>
        <Field label="Greeting / answer phrase *" full>
          <Input value={answerPhrase} onChange={setAnswerPhrase}
            placeholder={industryData
              ? applyGreeting(industryData.greetingTemplate, businessName || '[Business Name]')
              : 'Thank you for calling [Business Name], how can I help?'} />
        </Field>
      </FormGrid>

      <div style={{ marginBottom: 22 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#7BAED4', marginBottom: 10 }}>Voice</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {VOICES.map(v => {
            const isSelected = voiceId === v.id
            const isRecommended = !!industryData && industryData.recommendedVoiceId === v.id
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setVoiceId(v.id)}
                style={{
                  position: 'relative', padding: '12px 14px', borderRadius: 12,
                  border: `1.5px solid ${isSelected ? '#E8622A' : 'rgba(255,255,255,0.08)'}`,
                  background: isSelected ? 'rgba(232,98,42,0.08)' : '#071829',
                  cursor: 'pointer', textAlign: 'left' as const, fontFamily: 'Outfit, sans-serif',
                }}
              >
                {isRecommended && (
                  <span style={{
                    position: 'absolute', top: -8, right: 10,
                    background: '#22C55E', color: 'white',
                    fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
                    padding: '3px 8px', borderRadius: 6,
                  }}>RECOMMENDED</span>
                )}
                <div style={{ fontWeight: 600, fontSize: 14, color: 'white' }}>🎙️ {v.name}</div>
                <div style={{ fontSize: 12, color: '#4A9FE8', marginTop: 2 }}>{v.desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── SECTION 5: Opening hours ─────────────────────────────────────── */}
      <SectionTitle>5 · Opening hours</SectionTitle>
      <div style={{ marginBottom: 22 }}>
        {DAYS.map(day => {
          const h = hours[day]
          return (
            <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#071829', borderRadius: 10, marginBottom: 6 }}>
              <span style={{ width: 96, fontSize: 13, fontWeight: 600, color: 'white', flexShrink: 0 }}>{day}</span>
              <Toggle checked={!h.closed} onChange={v => updateHour(day, 'closed', !v)} />
              {!h.closed ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  <input
                    type="time"
                    value={h.open}
                    onChange={e => updateHour(day, 'open', e.target.value)}
                    style={timeInp}
                  />
                  <span style={{ color: '#7BAED4', fontSize: 12 }}>to</span>
                  <input
                    type="time"
                    value={h.close}
                    onChange={e => updateHour(day, 'close', e.target.value)}
                    style={timeInp}
                  />
                </div>
              ) : (
                <span style={{ fontSize: 12, color: '#7BAED4' }}>Closed</span>
              )}
            </div>
          )
        })}
      </div>

      {/* ── SECTION 6: Services ──────────────────────────────────────────── */}
      <SectionTitle>6 · Services</SectionTitle>
      <div style={{ marginBottom: 22 }}>
        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 32px', gap: 8, marginBottom: 6, padding: '0 0 0 0' }}>
          {['Name', 'Category', 'Price', ''].map(h => (
            <div key={h} style={{ fontSize: 11, color: '#4A9FE8', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{h}</div>
          ))}
        </div>
        {services.map((row, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 32px', gap: 8, marginBottom: 5 }}>
              <input value={row.name} onChange={e => updateService(i, 'name', e.target.value)} placeholder="Service name" style={inpStyle} />
              <input value={row.category} onChange={e => updateService(i, 'category', e.target.value)} placeholder="Category" style={inpStyle} />
              <input value={row.price} onChange={e => updateService(i, 'price', e.target.value)} placeholder="$" style={inpStyle} />
              <button
                onClick={() => removeService(i)}
                style={{ background: 'rgba(239,68,68,0.1)', border: 'none', color: '#EF4444', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >✕</button>
            </div>
            <input value={row.description} onChange={e => updateService(i, 'description', e.target.value)} placeholder="Description (optional)" style={{ ...inpStyle, fontSize: 12 }} />
          </div>
        ))}
        <button
          onClick={addService}
          style={{ width: '100%', padding: 10, background: 'transparent', border: '1px dashed rgba(74,159,232,0.3)', borderRadius: 8, color: '#4A9FE8', fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
        >+ Add service</button>
      </div>

      {/* ── SECTION 7: FAQs ──────────────────────────────────────────────── */}
      <SectionTitle>7 · FAQs</SectionTitle>
      <div style={{ marginBottom: 22 }}>
        {faqs.map((faq, i) => (
          <div key={i} style={{ padding: 14, background: '#071829', borderRadius: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input value={faq.question} onChange={e => updateFaq(i, 'question', e.target.value)} placeholder={`Question ${i + 1}`} style={{ ...inpStyle, flex: 1 }} />
              <button
                onClick={() => removeFaq(i)}
                style={{ background: 'rgba(239,68,68,0.1)', border: 'none', color: '#EF4444', padding: '0 12px', borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}
              >✕</button>
            </div>
            <textarea
              value={faq.answer}
              onChange={e => updateFaq(i, 'answer', e.target.value)}
              placeholder="Answer"
              rows={2}
              style={{ ...inpStyle, resize: 'vertical' as const, width: '100%', boxSizing: 'border-box' as const }}
            />
          </div>
        ))}
        <button
          onClick={addFaq}
          style={{ width: '100%', padding: 10, background: 'transparent', border: '1px dashed rgba(74,159,232,0.3)', borderRadius: 8, color: '#4A9FE8', fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
        >+ Add FAQ</button>
      </div>

      {/* ── SECTION 8: Escalation ────────────────────────────────────────── */}
      <SectionTitle>8 · Escalation</SectionTitle>
      <Field label="After hours instruction *" hint="What should the AI do when the business is closed, or when a call needs to escalate?">
        <TextArea value={afterHours} onChange={setAfterHours} rows={4}
          placeholder="e.g. Take a message and SMS the owner on 0412 345 678. For emergencies, call 0412 345 678 directly." />
      </Field>
      <Field label="Escalation number" hint="Who to call or SMS for urgent issues that can't wait">
        <Input value={escalationNumber} onChange={setEscalationNumber} placeholder="+61 4XX XXX XXX" />
      </Field>
      <Divider />

      {/* ── SECTION 9: Notifications ─────────────────────────────────────── */}
      <SectionTitle>9 · Notifications</SectionTitle>

      {/* Email block */}
      <div style={sectionCard}>
        <div style={cardLabel}>📧 Email</div>
        <Field label="Notification email">
          <Input value={notifEmail} onChange={setNotifEmail} type="email" placeholder="owner@business.com.au" />
        </Field>
        {([
          ['notifEmailOnTransfer', 'Email on every call transfer', notifEmailOnTransfer, setNotifEmailOnTransfer],
          ['notifDailySummary',    'Daily summary (6pm)',          notifDailySummary,    setNotifDailySummary],
          ['notifWeeklyReport',   'Weekly report (Mon 6am)',      notifWeeklyReport,    setNotifWeeklyReport],
        ] as [string, string, boolean, (v: boolean) => void][]).map(([key, label, checked, setChecked]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ fontSize: 13, color: 'white' }}>{label}</span>
            <Toggle checked={checked} onChange={setChecked} />
          </div>
        ))}
      </div>

      {/* WhatsApp block */}
      <div style={sectionCard}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: notifWhatsapp ? 12 : 0 }}>
          <span style={cardLabel}>💬 WhatsApp notifications</span>
          <Toggle checked={notifWhatsapp} onChange={setNotifWhatsapp} />
        </div>
        {notifWhatsapp && (
          <Input value={notifWhatsappNum} onChange={setNotifWhatsappNum} placeholder="+61 4XX XXX XXX" />
        )}
      </div>

      {/* Urgent call-through block */}
      <div style={{ ...sectionCard, border: '1px solid rgba(232,98,42,0.25)', background: 'rgba(232,98,42,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: notifUrgentCall ? 12 : 0 }}>
          <div>
            <div style={cardLabel}>📞 Urgent call alerts</div>
            <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 3 }}>
              We&apos;ll call or SMS this number when something critical needs immediate attention
            </div>
          </div>
          <Toggle checked={notifUrgentCall} onChange={setNotifUrgentCall} />
        </div>
        {notifUrgentCall && (
          <Input value={notifUrgentNum} onChange={setNotifUrgentNum} placeholder="+61 4XX XXX XXX" />
        )}
      </div>

      {/* ── Final options ─────────────────────────────────────────────────── */}
      <SectionTitle>10 · Notes &amp; options</SectionTitle>
      <Field label="Initial note (optional)">
        <TextArea
          value={initialNote}
          onChange={setInitialNote}
          placeholder="e.g. Met at networking event. Interested in towing dispatch. Paid via SMS 29 April."
        />
      </Field>

      <div style={{ marginTop: 16, marginBottom: 22 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: 'white', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={sendWelcomeEmail}
            onChange={e => setSendWelcomeEmail(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: '#E8622A' }}
          />
          Send welcome email immediately
        </label>
      </div>

      {error && <ErrorBanner msg={error} />}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 18 }}>
        <button onClick={onClose} style={ghostBtn()}>Cancel</button>
        <button onClick={submit} disabled={submitting} style={primaryBtn(submitting)}>
          {submitting ? 'Creating…' : 'Create account →'}
        </button>
      </div>
    </ModalShell>
  )
}

// ── Shared UI bits ─────────────────────────────────────────────────────────

export function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(6,19,34,0.85)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 28, overflow: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 760, background: '#0A1E38',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
          padding: 28, color: '#F2F6FB', position: 'relative' as const,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 14, right: 14,
            width: 30, height: 30, borderRadius: 8,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'white', cursor: 'pointer', fontSize: 18, lineHeight: 1,
          }}
        >×</button>
        {children}
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: 11, fontWeight: 700, color: '#7BAED4',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      marginTop: 26, marginBottom: 12,
    }}>{children}</h3>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '14px 0 0' }} />
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 6 }}>
      {children}
    </div>
  )
}

function Field({ label, hint, full, children }: { label: string; hint?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined, marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#7BAED4', marginBottom: 6 }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 11, color: '#5A8AB7', marginTop: 4 }}>{hint}</p>}
    </div>
  )
}

const inpStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 8,
  background: '#071829', border: '1px solid rgba(255,255,255,0.1)',
  color: 'white', fontSize: 13, fontFamily: 'Outfit, sans-serif',
  boxSizing: 'border-box',
}

const timeInp: React.CSSProperties = {
  ...inpStyle, width: 110,
}

const sectionCard: React.CSSProperties = {
  background: '#071829', borderRadius: 12, padding: 16, marginBottom: 12,
  border: '1px solid rgba(255,255,255,0.06)',
}

const cardLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: '#7BAED4', marginBottom: 12,
  display: 'block',
}

function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={inpStyle}
    />
  )
}

function TextArea({ value, onChange, placeholder, rows = 4 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{ ...inpStyle, resize: 'vertical' }}
    />
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ ...inpStyle, cursor: 'pointer' }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        padding: 2, background: checked ? '#E8622A' : 'rgba(255,255,255,0.15)',
        position: 'relative', flexShrink: 0, transition: 'background 0.2s',
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: 10, background: 'white',
        position: 'absolute', top: 2, left: checked ? 22 : 2, transition: 'left 0.2s',
      }} />
    </button>
  )
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div style={{
      padding: '10px 14px', background: 'rgba(239,68,68,0.10)',
      border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8,
      color: '#EF4444', fontSize: 12, marginBottom: 14,
    }}>{msg}</div>
  )
}

function primaryBtn(busy: boolean): React.CSSProperties {
  return {
    padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700,
    background: busy ? '#7BAED4' : '#E8622A', border: 'none',
    color: 'white', cursor: busy ? 'wait' : 'pointer',
    fontFamily: 'Outfit, sans-serif',
  }
}

function ghostBtn(): React.CSSProperties {
  return {
    padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
    background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
    color: 'white', cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
  }
}

function SuccessRow({ label, value, mono, badge }: { label: string; value: string; mono?: boolean; badge?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ fontSize: 12, color: '#7BAED4' }}>{label}</span>
      {badge ? (
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: `${badge}22`, color: badge }}>{value}</span>
      ) : (
        <CopyableValue value={value} mono={mono} />
      )}
    </div>
  )
}

function CopyableValue({ value, mono }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  if (!value) return <span style={{ fontSize: 12, color: '#5A8AB7' }}>—</span>
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
      }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: 'transparent', border: 'none', cursor: 'pointer',
        fontSize: 13, color: 'white', fontWeight: 600,
        fontFamily: mono ? 'monospace' : 'Outfit, sans-serif',
        padding: 0,
      }}
    >
      {value}
      <span style={{ fontSize: 10, color: copied ? '#22C55E' : '#7BAED4', fontFamily: 'Outfit, sans-serif', fontWeight: 700 }}>
        {copied ? '✓ COPIED' : 'COPY'}
      </span>
    </button>
  )
}
