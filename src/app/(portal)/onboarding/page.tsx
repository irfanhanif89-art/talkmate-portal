'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOnboardingStore } from '@/store/onboarding-store'
import { BUSINESS_TYPE_CONFIG, type BusinessType } from '@/lib/business-types'
import { Plus, Trash2, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import LegalAcceptanceForm from '@/components/portal/legal-acceptance-form'

// ── Custom Toggle (no base-ui) ──────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', padding: 2, background: checked ? '#E8622A' : 'rgba(255,255,255,0.15)', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
      <div style={{ width: 20, height: 20, borderRadius: 10, background: 'white', position: 'absolute', top: 2, left: checked ? 22 : 2, transition: 'left 0.2s' }} />
    </button>
  )
}

// ── Types ────────────────────────────────────────────────────────────────────
interface HourEntry { open: string; close: string; closed: boolean }
interface CatalogRow { name: string; category: string; price: string; description: string }
interface Faq { question: string; answer: string }
interface Notifs { emailOnTransfer: boolean; dailySummary: boolean; weeklyReport: boolean; email: string; whatsapp: boolean; whatsappNum: string; telegram: boolean; telegramUser: string; urgentCall: boolean; urgentNum: string }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const AU_TZ = ['Australia/Brisbane', 'Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Hobart']
const STEPS = ['Business', 'Hours', 'Services', 'Voice', 'FAQs', 'Escalation', 'Notifications', 'Agreement', 'Payment', 'Your Number', "You're Live!"]

const defaultHours: Record<string, HourEntry> = {
  Monday: { open: '09:00', close: '17:00', closed: false },
  Tuesday: { open: '09:00', close: '17:00', closed: false },
  Wednesday: { open: '09:00', close: '17:00', closed: false },
  Thursday: { open: '09:00', close: '17:00', closed: false },
  Friday: { open: '09:00', close: '17:00', closed: false },
  Saturday: { open: '09:00', close: '13:00', closed: false },
  Sunday: { open: '09:00', close: '13:00', closed: true },
}

const defaultCatalog: CatalogRow[] = [
  { name: 'Service 1', category: 'General', price: '', description: 'Describe this service' },
  { name: 'Service 2', category: 'General', price: '', description: 'Describe this service' },
]

const defaultFaqs: Faq[] = [
  { question: 'What are your opening hours?', answer: '' },
  { question: 'How do I get in touch?', answer: '' },
  { question: 'What services do you offer?', answer: '' },
]

const defaultNotifs: Notifs = {
  emailOnTransfer: true, dailySummary: true, weeklyReport: true, email: '',
  whatsapp: false, whatsappNum: '', telegram: false, telegramUser: '',
  urgentCall: false, urgentNum: '',
}

const voices = [
  { id: 'sarah', name: 'Sarah', desc: 'Professional Female', sample: 'Hi, thank you for calling! How can I help you today?' },
  { id: 'james', name: 'James', desc: 'Professional Male', sample: 'Good day, thanks for calling. What can I do for you?' },
  { id: 'emma', name: 'Emma', desc: 'Friendly Female', sample: "Hey there! I'm Emma. How can I help?" },
  { id: 'liam', name: 'Liam', desc: 'Casual Male', sample: "Hey, what's up! How can I help you out today?" },
]

const inp = { background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 10, padding: '11px 14px', width: '100%', fontFamily: 'Outfit,sans-serif', fontSize: 14, outline: 'none' } as React.CSSProperties
const ta = { ...inp, resize: 'vertical' } as React.CSSProperties
const lbl = { fontSize: 12, color: '#4A7FBB', fontWeight: 600 as const, display: 'block' as const, marginBottom: 6 }

const AGREEMENT_TEXT = `Talkmate Pty Ltd — Customer Service Agreement | Last updated: April 2026

1. DEFINITIONS
"Talkmate" means Talkmate Pty Ltd. "Customer" means the entity or individual accepting these terms. "Service" means the AI-powered voice agent platform, including inbound call handling, transcription, and the client portal. "AI Number" means the dedicated Australian mobile telephone number provisioned to the Customer via Twilio Inc.

2. SERVICES & ACTIVATION
Talkmate will provision an Australian mobile number and configure an AI voice agent upon receipt of cleared payment. The Customer is solely responsible for correctly diverting their business telephone number to the AI Number. Talkmate accepts no liability for missed calls arising from incorrect divert configuration, network issues, or third-party carrier delays. The AI agent targets 99.5% monthly availability.

3. FEES, PAYMENT & REFUNDS
A one-time implementation fee of $299 AUD (inc. GST) applies to all new accounts. Monthly subscription fees of $299 AUD (inc. GST) are charged in advance on the anniversary of activation. Fees are non-refundable once the AI agent has been activated and the AI Number provisioned. Talkmate may suspend the Service for non-payment after 7 days written notice. Talkmate may vary pricing with 30 days written notice.

4. TERM & TERMINATION
This Agreement commences on the date of first payment and continues on a monthly rolling basis. Either party may terminate with 30 days written notice to hello@talkmate.com.au. Upon termination, the AI Number will be decommissioned, call recordings retained for 90 days then deleted, and portal access revoked.

5. CALL RECORDING & TELECOMMUNICATIONS COMPLIANCE
The Service records all calls for quality assurance and service delivery purposes. Recording is lawful under the Telecommunications (Interception and Access) Act 1979 (Cth) and the Invasion of Privacy Act 1971 (Qld) where a participant consents. The Customer is responsible for compliance with applicable laws in their jurisdiction, including all-party consent where required (e.g., NSW, SA). Talkmate recommends the AI agent announce: "This call may be recorded for quality purposes." The Customer indemnifies Talkmate against claims arising from the Customer's failure to comply with call recording laws.

6. PRIVACY & DATA PROTECTION
Talkmate complies with the Privacy Act 1988 (Cth) and the Australian Privacy Principles (APPs) as amended by the Privacy and Other Legislation Amendment Act 2024. Personal information is used solely for service delivery and as described in our Privacy Policy. Talkmate will not sell personal information to third parties. Data is stored on secure Australian-based servers. In the event of an eligible data breach, Talkmate will notify the OAIC and affected individuals per the Notifiable Data Breaches scheme. Call data may be processed by Vapi.ai and ElevenLabs under data processing agreements compliant with APP 8.

7. INTELLECTUAL PROPERTY
Talkmate retains all IP rights in the platform, AI models, and portal. The Customer retains ownership of their business data and content.

8. OWNERSHIP OF AI NUMBER & AGENT
The AI Number is and remains the property of Talkmate and its telecommunications carrier. The Customer is granted a non-exclusive, non-transferable licence to use the AI Number solely for receiving inbound calls during the term of this Agreement. The Customer must not transfer, port, sell, sublicence, or assign the AI Number to any third party. The AI agent, its configuration, voice, system prompt, and workflows are the intellectual property of Talkmate. The Customer may not copy, reverse-engineer, or provide the AI agent configuration to any third party. Upon termination, the AI Number will be decommissioned and the AI agent deactivated. Talkmate accepts no liability for business disruption arising from the Customer's inability to retain the AI Number post-termination.

9. SOCIAL PROOF
By accepting these Terms, the Customer grants Talkmate a non-exclusive, royalty-free, revocable licence to display the Customer's business name and/or logo as a client reference on Talkmate's website, social media channels, pitch materials, and advertising campaigns. This licence may be revoked at any time by written notice to hello@talkmate.com.au, whereupon Talkmate will remove references within 14 business days.

10. MARKETING COMMUNICATIONS
In accordance with the Spam Act 2003 (Cth), by ticking the marketing consent checkbox, the Customer provides express consent for Talkmate to send commercial electronic messages including product updates, promotions, tips, and case studies. This consent applies until withdrawn. The Customer may unsubscribe at any time. Talkmate will process unsubscribe requests within 5 business days. Transactional emails are not marketing communications and will continue regardless of marketing consent status.

11. TERMINATION BY TALKMATE
Talkmate may suspend or terminate the Service immediately and without prior notice if: (a) the Customer breaches any provision and fails to remedy within 48 hours; (b) the Customer uses the Service for any unlawful, fraudulent, or abusive purpose; (c) Talkmate reasonably believes continued provision poses legal or reputational risk; (d) the Customer's account has an outstanding unpaid balance exceeding 14 days; (e) a third-party provider (including Twilio, Vapi.ai, or ElevenLabs) withdraws or suspends their services; or (f) Talkmate ceases to operate. No refund of prepaid fees will be issued upon termination under this clause.

12. FORCE MAJEURE
Talkmate will not be liable for any failure or delay caused by circumstances beyond reasonable control, including acts of God, natural disasters, pandemic, fire, flood, war, terrorism, governmental action, power outages, internet or telecommunications failure, cyberattacks, or third-party platform outages (including Twilio, AWS, Vapi.ai, ElevenLabs, or Supabase). If a Force Majeure event continues for more than 30 consecutive days, either party may terminate without liability, except that no fees already paid will be refunded.

13. LIMITATION OF LIABILITY
Talkmate's total liability shall not exceed the total fees paid in the 3 months preceding the claim. Talkmate excludes all liability for indirect, consequential, special, or punitive damages. Nothing excludes liability for death, personal injury caused by negligence, or non-excludable consumer guarantees under the Australian Consumer Law.

14. DISPUTE RESOLUTION
In the event of a dispute, the parties agree to first attempt resolution through good-faith negotiation. If unresolved, disputes will be referred to mediation through the Resolution Institute (Australia). Governed by the laws of Queensland, Australia.

15. GENERAL
Talkmate may amend these Terms with 30 days written notice via email. Electronic acceptance (checkbox, click-wrap) constitutes a valid and binding signature under the Electronic Transactions Act 1999 (Cth).`

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const { currentStep, responses, setStep, setResponse, reset } = useOnboardingStore()
  const [loading, setLoading] = useState(false)
  const [bizId, setBizId] = useState('')
  const [bizType, setBizType] = useState<BusinessType>('other')
  const [uploading, setUploading] = useState(false)
  const [uploadDone, setUploadDone] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [tcAccepted, setTcAccepted] = useState(false)
  const [tcSubmitting, setTcSubmitting] = useState(false)
  const [tcError, setTcError] = useState<string | null>(null)
  const [payProcessing, setPayProcessing] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)

  // Derived state
  const config = BUSINESS_TYPE_CONFIG[bizType]
  const hours = (responses.openingHours as Record<string, HourEntry>) || defaultHours
  const catalog = (responses.catalog as CatalogRow[]) || defaultCatalog
  const faqs = (responses.faqs as Faq[]) || defaultFaqs
  const notifs = (responses.notifications as Notifs) || defaultNotifs
  const voice = (responses.voice as string) || 'sarah'
  const tone = (responses.tone as string) || 'Friendly'

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: biz } = await supabase.from('businesses').select('id, business_type').eq('owner_user_id', user.id).single()
      if (biz) {
        setBizId(biz.id)
        setBizType(biz.business_type as BusinessType)
        if (!responses.catalog) setResponse('catalog', defaultCatalog)
        if (!responses.faqs) setResponse('faqs', defaultFaqs)
        if (!responses.openingHours) setResponse('openingHours', defaultHours)
        if (!responses.notifications) setResponse('notifications', defaultNotifs)
      }
    }
    load()
  }, [])

  async function save() {
    if (!bizId) return
    await supabase.from('onboarding_responses').upsert({ business_id: bizId, current_step: currentStep, responses }, { onConflict: 'business_id' })
  }

  async function next() {
    setLoading(true); await save(); setStep(currentStep + 1); setLoading(false)
    window.scrollTo(0, 0)
  }
  function back() { setStep(currentStep - 1); window.scrollTo(0, 0) }

  async function goLive() {
    setLoading(true); await save()
    const res = await fetch('/api/onboarding/complete', { method: 'POST' })
    if (res.ok) { reset(); router.push('/dashboard') }
    else { alert('Something went wrong — please try again'); setLoading(false) }
  }

  function simulateUpload(file?: File) {
    setUploading(true)
    setTimeout(() => {
      setUploading(false)
      setUploadDone(true)
      setResponse('catalog', [
        { name: file ? file.name.replace(/\.[^.]+$/, '') + ' - Item 1' : 'Item 1', category: 'Services', price: '', description: 'Scanned from upload' },
        { name: 'Item 2', category: 'Services', price: '', description: 'Scanned from upload' },
        { name: 'Item 3', category: 'Services', price: '', description: 'Scanned from upload' },
      ])
    }, 2000)
  }

  // Catalog helpers
  function updateCatalog(i: number, field: keyof CatalogRow, val: string) { const c = [...catalog]; c[i] = { ...c[i], [field]: val }; setResponse('catalog', c) }
  function addCatalogRow() { setResponse('catalog', [...catalog, { name: '', category: '', price: '', description: '' }]) }
  function removeCatalogRow(i: number) { setResponse('catalog', catalog.filter((_, j) => j !== i)) }

  // FAQ helpers
  function updateFaq(i: number, field: keyof Faq, val: string) { const f = [...faqs]; f[i] = { ...f[i], [field]: val }; setResponse('faqs', f) }
  function addFaq() { setResponse('faqs', [...faqs, { question: '', answer: '' }]) }
  function removeFaq(i: number) { setResponse('faqs', faqs.filter((_, j) => j !== i)) }

  function updateHour(day: string, field: keyof HourEntry, val: string | boolean) {
    setResponse('openingHours', { ...hours, [day]: { ...hours[day], [field]: val } })
  }
  function updateNotif(field: keyof Notifs, val: boolean | string) {
    setResponse('notifications', { ...notifs, [field]: val })
  }

  async function previewVoice(voiceId: string) {
    try {
      const res = await fetch(`/api/voice/preview?voice=${voiceId}&t=${Date.now()}`)
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.play()
      audio.onended = () => URL.revokeObjectURL(url)
    } catch (e) { console.error('Voice preview failed', e) }
  }

  // Styles
  const card = { background: '#0A1E38', border: '1px solid rgba(232,98,42,0.2)', borderRadius: 20, padding: 36 }
  const sectionCard = { background: '#071829', borderRadius: 14, padding: 16, marginBottom: 12 }

  return (
    <div style={{ minHeight: '100vh', background: '#061322', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 20px' }}>
      <div style={{ width: '100%', maxWidth: 680 }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 36 }}>
          <div style={{ width: 36, height: 36, background: '#E8622A', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg viewBox="0 0 36 36" width="20" height="20" fill="none"><rect x="6" y="8" width="24" height="5" rx="2.5" fill="white"/><rect x="14" y="8" width="8" height="22" rx="2.5" fill="white"/></svg>
          </div>
          <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, letterSpacing: '-0.5px', color: 'white', fontSize: '1.3rem' }}>
            talk<span style={{ fontWeight: 300, letterSpacing: '2px', color: '#4A9FE8' }}>mate</span>
          </span>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          {STEPS.map((s, i) => {
            const n = i + 1
            const done = n < currentStep; const active = n === currentStep
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, background: done ? '#22c55e' : active ? '#E8622A' : 'rgba(255,255,255,0.08)', color: 'white', boxShadow: active ? '0 0 0 4px rgba(232,98,42,0.2)' : 'none' }}>
                  {done ? <Check size={13} /> : n}
                </div>
                {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: done ? '#22c55e' : 'rgba(255,255,255,0.08)' }} />}
              </div>
            )
          })}
        </div>
        <p style={{ fontSize: 12, color: '#4A7FBB', marginBottom: 24 }}>
          Step {currentStep} of {STEPS.length}: <strong style={{ color: 'white' }}>{STEPS[currentStep - 1]}</strong>
        </p>

        {/* Card */}
        <div style={card}>

          {/* STEP 1: Business Details + Industry Selection */}
          {currentStep === 1 && (
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'white', marginBottom: 6 }}>Tell us about your business</h2>
              <p style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 24 }}>Your AI agent will use this to introduce itself and answer questions.</p>

              {/* Industry selection (Session 1 brief Part 5) */}
              <label style={lbl}>What type of business are you?</label>
              <p style={{ fontSize: 12, color: '#4A7FBB', marginBottom: 12, marginTop: -4 }}>This configures the right CRM features and smart lists for your industry.</p>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 24,
              }}>
                {[
                  ['restaurants', '🍕', 'Restaurant & Takeaway'],
                  ['towing', '🚗', 'Towing & Transport'],
                  ['real_estate', '🏠', 'Real Estate'],
                  ['trades', '🔧', 'Trades & Services'],
                  ['healthcare', '🏥', 'Healthcare & Clinics'],
                  ['ndis', '💙', 'NDIS Provider'],
                  ['retail', '🛍️', 'Retail'],
                  ['professional_services', '💼', 'Professional Services'],
                  ['other', '⚙️', 'Other'],
                ].map(([key, emoji, name]) => {
                  const selected = (responses.industry as string) === key
                  return (
                    <button
                      key={key} type="button"
                      onClick={() => setResponse('industry', key)}
                      style={{
                        padding: 14, borderRadius: 10,
                        background: selected ? 'rgba(232,98,42,0.08)' : '#071829',
                        border: `1.5px solid ${selected ? '#E8622A' : 'rgba(255,255,255,0.06)'}`,
                        color: 'white', cursor: 'pointer', textAlign: 'left',
                        fontFamily: 'Outfit, sans-serif',
                      }}
                    >
                      <div style={{ fontSize: 22, marginBottom: 6 }}>{emoji}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{name}</div>
                    </button>
                  )
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[['Business Name', 'businessName', 'My Business Pty Ltd'], ['Phone Number', 'phone', '+61 4XX XXX XXX'], ['Address', 'address', '123 Main St, Brisbane QLD 4000'], ['Website', 'website', 'www.mybusiness.com.au']].map(([label, key, ph]) => (
                  <div key={key}>
                    <label style={lbl}>{label}</label>
                    <input value={(responses[key] as string) || ''} onChange={e => setResponse(key, e.target.value)} placeholder={ph} style={inp} />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16 }}>
                <label style={lbl}>Timezone</label>
                <select value={(responses.timezone as string) || 'Australia/Brisbane'} onChange={e => setResponse('timezone', e.target.value)}
                  style={{ ...inp, appearance: 'auto', cursor: 'pointer' }}>
                  {AU_TZ.map(tz => <option key={tz} value={tz} style={{ background: '#0A1E38' }}>{tz.replace('Australia/', '')}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* STEP 2: Opening Hours */}
          {currentStep === 2 && (
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'white', marginBottom: 6 }}>Opening hours</h2>
              <p style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 24 }}>Your AI will tell callers your hours and handle after-hours calls appropriately.</p>
              {DAYS.map(day => {
                const h = hours[day] || defaultHours[day]
                return (
                  <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#071829', borderRadius: 12, marginBottom: 8 }}>
                    <span style={{ width: 100, fontSize: 14, fontWeight: 500, color: 'white', flexShrink: 0 }}>{day}</span>
                    <Toggle checked={!h.closed} onChange={v => updateHour(day, 'closed', !v)} />
                    {!h.closed ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                        <input type="time" value={h.open} onChange={e => updateHour(day, 'open', e.target.value)} style={{ ...inp, width: 110 }} />
                        <span style={{ color: '#4A7FBB', fontSize: 13 }}>to</span>
                        <input type="time" value={h.close} onChange={e => updateHour(day, 'close', e.target.value)} style={{ ...inp, width: 110 }} />
                      </div>
                    ) : <span style={{ fontSize: 13, color: '#4A7FBB' }}>Closed</span>}
                  </div>
                )
              })}
            </div>
          )}

          {/* STEP 3: Services/Menu */}
          {currentStep === 3 && (
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'white', marginBottom: 6 }}>Your {config.catalogLabel}</h2>
              <p style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 20 }}>Your AI will describe, quote, and book these for callers.</p>

              {/* Upload zone */}
              {!uploadDone ? (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ background: 'linear-gradient(135deg,rgba(74,159,232,0.08),rgba(232,98,42,0.05))', border: '1.5px dashed rgba(74,159,232,0.3)', borderRadius: 14, padding: 24, textAlign: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>📄</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginBottom: 4 }}>Upload your menu or services list</div>
                    <div style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 16 }}>PDF, image, Word doc — we&apos;ll scan it and fill everything in for you</div>
                    {uploading ? (
                      <div>
                        <div style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 8 }}>⚡ Scanning your file...</div>
                        <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: '60%', background: '#E8622A', borderRadius: 2, animation: 'pulse 1s infinite' }} />
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#E8622A', color: 'white', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}>
                          📤 Upload File
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) simulateUpload(e.target.files[0]) }} />
                        </label>
                        <button onClick={() => setShowUrlInput(!showUrlInput)}
                          style={{ padding: '10px 20px', background: 'transparent', border: '1px solid rgba(74,159,232,0.3)', color: '#4A9FE8', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}>
                          🌐 Paste Website URL
                        </button>
                      </div>
                    )}
                    {showUrlInput && !uploading && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 14, maxWidth: 480, margin: '14px auto 0' }}>
                        <input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://yourbusiness.com.au/menu" style={{ ...inp, flex: 1 }} />
                        <button onClick={() => { if (urlInput) simulateUpload() }} style={{ padding: '0 18px', background: '#E8622A', color: 'white', border: 'none', borderRadius: 10, fontFamily: 'Outfit,sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>Scan →</button>
                      </div>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: '#4A7FBB', textAlign: 'center' }}>Or add your services manually below</p>
                </div>
              ) : (
                <div style={{ padding: '12px 16px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, marginBottom: 16, fontSize: 13, color: '#22c55e' }}>
                  ✅ Items auto-filled from your upload — edit as needed
                </div>
              )}

              {/* Manual items */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 32px', gap: 8, marginBottom: 6 }}>
                  {['Name', 'Category', 'Price', ''].map(h => <div key={h} style={{ fontSize: 11, color: '#4A7FBB', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>)}
                </div>
                {catalog.map((row, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 32px', gap: 8, marginBottom: 6 }}>
                      <input value={row.name} onChange={e => updateCatalog(i, 'name', e.target.value)} placeholder="Service name" style={inp} />
                      <input value={row.category} onChange={e => updateCatalog(i, 'category', e.target.value)} placeholder="Category" style={inp} />
                      <input value={row.price} onChange={e => updateCatalog(i, 'price', e.target.value)} placeholder="$" style={inp} />
                      <button onClick={() => removeCatalogRow(i)} style={{ background: 'rgba(239,68,68,0.1)', border: 'none', color: '#ef4444', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={14} /></button>
                    </div>
                    <input value={row.description} onChange={e => updateCatalog(i, 'description', e.target.value)} placeholder="Description (optional)" style={{ ...inp, fontSize: 13 }} />
                  </div>
                ))}
              </div>
              <button onClick={addCatalogRow} style={{ width: '100%', padding: 12, background: 'transparent', border: '1px dashed rgba(74,159,232,0.3)', borderRadius: 10, color: '#4A9FE8', fontFamily: 'Outfit,sans-serif', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Plus size={14} /> Add {config.catalogLabel.replace(/s$/, '')}
              </button>
            </div>
          )}

          {/* STEP 4: Voice & Tone */}
          {currentStep === 4 && (
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'white', marginBottom: 6 }}>AI Voice & Tone</h2>
              <p style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 24 }}>Choose how your AI receptionist sounds.</p>
              <div style={{ marginBottom: 24 }}>
                <label style={lbl}>Greeting message</label>
                <textarea value={(responses.greeting as string) || `Thank you for calling ${(responses.businessName as string) || 'us'}. How can I help you today?`}
                  onChange={e => setResponse('greeting', e.target.value)} rows={3} style={ta} />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={lbl}>Voice</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {voices.map(v => (
                    <div key={v.id} onClick={() => setResponse('voice', v.id)}
                      style={{ padding: 14, borderRadius: 12, border: `1.5px solid ${voice === v.id ? '#E8622A' : 'rgba(255,255,255,0.08)'}`, background: voice === v.id ? 'rgba(232,98,42,0.08)' : '#071829', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'white' }}>🎙️ {v.name}</div>
                        <div style={{ fontSize: 12, color: '#4A7FBB' }}>{v.desc}</div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); previewVoice(v.id) }}
                        style={{ background: voice === v.id ? '#E8622A' : 'rgba(255,255,255,0.08)', border: 'none', color: 'white', padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit,sans-serif', flexShrink: 0 }}>▶ Preview</button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label style={lbl}>Tone</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {['Professional', 'Friendly', 'Casual'].map(t => (
                    <button key={t} onClick={() => setResponse('tone', t)}
                      style={{ flex: 1, padding: '11px', borderRadius: 10, border: tone === t ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tone === t ? '#E8622A' : '#071829', color: 'white', fontFamily: 'Outfit,sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recording disclosure (Session 1 brief Part 5) */}
              <div style={{
                marginTop: 20, padding: 16,
                background: '#071829',
                border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Include call recording disclosure</div>
                    <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 4, lineHeight: 1.55 }}>
                      Recommended. Adds a brief statement that the call may be recorded. Required in some circumstances under Australian privacy law.
                    </div>
                  </div>
                  <Toggle
                    checked={(responses.recordingDisclosureEnabled as boolean | undefined) ?? true}
                    onChange={v => setResponse('recordingDisclosureEnabled', v)}
                  />
                </div>
                {((responses.recordingDisclosureEnabled as boolean | undefined) ?? true) && (
                  <>
                    <div style={{ marginTop: 14, padding: '10px 12px', background: '#061322', borderRadius: 8, fontSize: 12, color: '#7BAED4', fontStyle: 'italic' }}>
                      Callers will hear: &ldquo;{(responses.recordingDisclosureText as string) || 'Thank you for calling. This call may be recorded for quality and business purposes.'}&rdquo;
                    </div>
                    <textarea
                      value={(responses.recordingDisclosureText as string) || 'Thank you for calling. This call may be recorded for quality and business purposes.'}
                      onChange={e => setResponse('recordingDisclosureText', e.target.value)}
                      rows={2}
                      style={{ ...ta, marginTop: 8, fontSize: 13 }}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {/* STEP 5: FAQs */}
          {currentStep === 5 && (
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'white', marginBottom: 6 }}>Custom FAQs</h2>
              <p style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 24 }}>Questions your AI will confidently answer on every call.</p>
              {faqs.map((faq, i) => (
                <div key={i} style={{ padding: 16, background: '#071829', borderRadius: 12, marginBottom: 10 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input value={faq.question} onChange={e => updateFaq(i, 'question', e.target.value)} placeholder={`Question ${i + 1}`} style={{ ...inp, flex: 1 }} />
                    <button onClick={() => removeFaq(i)} style={{ background: 'rgba(239,68,68,0.1)', border: 'none', color: '#ef4444', padding: '0 12px', borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}><Trash2 size={14} /></button>
                  </div>
                  <textarea value={faq.answer} onChange={e => updateFaq(i, 'answer', e.target.value)} placeholder="Answer" rows={2} style={ta} />
                </div>
              ))}
              <button onClick={addFaq} style={{ width: '100%', padding: 12, background: 'transparent', border: '1px dashed rgba(74,159,232,0.3)', borderRadius: 10, color: '#4A9FE8', fontFamily: 'Outfit,sans-serif', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Plus size={14} /> Add FAQ
              </button>
            </div>
          )}

          {/* STEP 6: Escalation */}
          {currentStep === 6 && (
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'white', marginBottom: 6 }}>Escalation rules</h2>
              <p style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 20 }}>Tell the AI when to stop and transfer the call to you.</p>
              <textarea
                value={(responses.escalationRules as string) || config.escalationTemplate}
                onChange={e => setResponse('escalationRules', e.target.value)}
                rows={7} style={ta} />
              <p style={{ fontSize: 12, color: '#4A7FBB', marginTop: 8 }}>Tip: Be specific. The more clearly you define triggers, the fewer unnecessary transfers you&apos;ll get.</p>
              {config.complianceRule && (
                <div style={{ marginTop: 16, padding: 14, background: 'rgba(232,98,42,0.08)', border: '1px solid rgba(232,98,42,0.3)', borderRadius: 12 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#E8622A', marginBottom: 4 }}>🔒 Locked compliance rule</p>
                  <p style={{ fontSize: 13, color: '#7BAED4' }}>{config.complianceRule}</p>
                </div>
              )}
            </div>
          )}

          {/* STEP 7: Notifications */}
          {currentStep === 7 && (
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'white', marginBottom: 6 }}>Notifications</h2>
              <p style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 20 }}>Choose how you want to be alerted.</p>

              <div style={sectionCard}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4A7FBB', marginBottom: 14 }}>📧 Email</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Notification email</label>
                  <input type="email" value={notifs.email} onChange={e => updateNotif('email', e.target.value)} placeholder="you@yourbusiness.com.au" style={inp} />
                </div>
                {[['emailOnTransfer', 'Email on every call transfer'], ['dailySummary', 'Daily summary (6pm)'], ['weeklyReport', 'Weekly report (Monday 6am)']].map(([k, l]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 14, color: 'white' }}>{l}</span>
                    <Toggle checked={!!(notifs as Record<string, unknown>)[k]} onChange={v => updateNotif(k as keyof Notifs, v)} />
                  </div>
                ))}
              </div>

              <div style={sectionCard}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: notifs.whatsapp ? 12 : 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4A7FBB' }}>💬 WhatsApp</span>
                  <Toggle checked={notifs.whatsapp} onChange={v => updateNotif('whatsapp', v)} />
                </div>
                {notifs.whatsapp && <input type="tel" value={notifs.whatsappNum} onChange={e => updateNotif('whatsappNum', e.target.value)} placeholder="+61 4XX XXX XXX" style={inp} />}
              </div>

              <div style={sectionCard}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: notifs.telegram ? 12 : 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4A7FBB' }}>✈️ Telegram</span>
                  <Toggle checked={notifs.telegram} onChange={v => updateNotif('telegram', v)} />
                </div>
                {notifs.telegram && <input value={notifs.telegramUser} onChange={e => updateNotif('telegramUser', e.target.value)} placeholder="@yourusername" style={inp} />}
              </div>

              <div style={{ ...sectionCard, border: '1px solid rgba(232,98,42,0.25)', background: 'rgba(232,98,42,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: notifs.urgentCall ? 12 : 0 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#E8622A' }}>📞 Urgent Call-Through</div>
                    <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 3 }}>We&apos;ll call your mobile when something critical needs your attention</div>
                  </div>
                  <Toggle checked={notifs.urgentCall} onChange={v => updateNotif('urgentCall', v)} />
                </div>
                {notifs.urgentCall && <input type="tel" value={notifs.urgentNum} onChange={e => updateNotif('urgentNum', e.target.value)} placeholder="+61 4XX XXX XXX" style={{ ...inp, marginTop: 4 }} />}
              </div>
            </div>
          )}

          {/* STEP 8: Terms acceptance (Session 1 brief Part 1) */}
          {currentStep === 8 && (
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'white', marginBottom: 6 }}>Review and accept our terms</h2>
              <p style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 20 }}>Please read and accept the following before activating your TalkMate account.</p>

              {tcAccepted ? (
                <div style={{ padding: 18, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 12, color: '#22C55E', fontSize: 14, fontWeight: 600 }}>
                  ✓ Terms accepted. You can now continue.
                </div>
              ) : (
                <>
                  <LegalAcceptanceForm
                    busy={tcSubmitting}
                    showHeader={false}
                    onSubmit={async (signature, acceptedDocs) => {
                      setTcSubmitting(true); setTcError(null)
                      try {
                        const res = await fetch('/api/legal/accept', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ signature, acceptedDocs }),
                        })
                        const data = await res.json()
                        if (!data.ok) {
                          setTcError(data.error || 'Could not record acceptance.')
                          return
                        }
                        setAgreed(true) // satisfy existing nav guard
                        setTcAccepted(true)
                      } finally {
                        setTcSubmitting(false)
                      }
                    }}
                  />
                  {tcError && (
                    <div style={{ marginTop: 12, fontSize: 13, color: '#EF4444', textAlign: 'center' }}>{tcError}</div>
                  )}
                  <div style={{ marginTop: 14, padding: 12, background: 'rgba(74,159,232,0.06)', border: '1px solid rgba(74,159,232,0.15)', borderRadius: 10, fontSize: 12, color: '#7BAED4' }}>
                    🔒 Your acceptance is recorded with your IP address, browser, signature, and timestamp.
                  </div>
                  <label style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', padding: 12, background: '#071829', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <input type="checkbox" checked={marketingConsent} onChange={e => setMarketingConsent(e.target.checked)} style={{ marginTop: 2, width: 17, height: 17, accentColor: '#E8622A', flexShrink: 0, cursor: 'pointer' }} />
                    <span style={{ fontSize: 13, color: 'white', lineHeight: 1.6 }}>
                      I consent to receive marketing emails from TalkMate including product updates, promotions, tips, and case studies. I may unsubscribe at any time. <span style={{ color: '#4A7FBB', fontSize: 11 }}>(Optional, Spam Act 2003 compliant)</span>
                    </span>
                  </label>
                </>
              )}
            </div>
          )}

          {/* STEP 9: Payment */}
          {currentStep === 9 && (
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'white', marginBottom: 6 }}>💳 Set Up Payment</h2>
              <p style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 20 }}>First payment activates your AI agent and provisions your phone number.</p>

              <div style={{ background: 'linear-gradient(135deg,rgba(232,98,42,0.1),rgba(10,30,56,1))', border: '1px solid rgba(232,98,42,0.25)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: '#4A7FBB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Today&apos;s charge</div>
                {[['One-time implementation fee', '$299.00'], ['Starter Plan — Month 1', '$299.00']].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 8 }}>
                    <span style={{ color: '#7BAED4' }}>{l}</span>
                    <span style={{ fontWeight: 600, color: 'white' }}>{v}</span>
                  </div>
                ))}
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800 }}>
                  <span style={{ color: 'white' }}>Total due today</span>
                  <span style={{ color: '#E8622A' }}>$598.00 AUD</span>
                </div>
                <div style={{ fontSize: 12, color: '#4A7FBB', marginTop: 8 }}>Then $299/month. Cancel anytime with 30 days notice.</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={lbl}>Cardholder Name</label>
                  <input type="text" placeholder="John Smith" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Card Number</label>
                  <input type="text" placeholder="1234 5678 9012 3456" maxLength={19} style={inp} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={lbl}>Expiry</label>
                    <input type="text" placeholder="MM / YY" maxLength={7} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>CVV</label>
                    <input type="text" placeholder="•••" maxLength={4} style={inp} />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 16, padding: '12px 16px', background: '#071829', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#4A7FBB' }}>
                🔒 <span>Secured by <strong style={{ color: 'white' }}>Stripe</strong>. Your card details are never stored by Talkmate.</span>
              </div>

              <button onClick={() => { setPayProcessing(true); setTimeout(() => { setPayProcessing(false); setStep(10) }, 2000) }}
                disabled={payProcessing}
                style={{ width: '100%', marginTop: 20, padding: 16, background: '#E8622A', color: 'white', border: 'none', borderRadius: 12, fontFamily: 'Outfit,sans-serif', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
                {payProcessing ? '⚡ Processing payment...' : 'Pay $598 & Activate My AI Agent →'}
              </button>
            </div>
          )}

          {/* STEP 10: AI Number */}
          {currentStep === 10 && (
            <div>
              <div style={{ textAlign: 'center', paddingBottom: 20 }}>
                <div style={{ fontSize: 52, marginBottom: 16 }}>📞</div>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', marginBottom: 8 }}>Your Talkmate Number</h2>
                <p style={{ color: '#7BAED4', fontSize: 14, lineHeight: 1.6, maxWidth: 400, margin: '0 auto' }}>
                  Divert your business phone to this number and your AI agent answers every call — 24/7, never misses one.
                </p>
              </div>

              <div style={{ background: 'linear-gradient(135deg,rgba(232,98,42,0.12),rgba(74,159,232,0.08))', border: '1.5px solid rgba(232,98,42,0.3)', borderRadius: 16, padding: 28, textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4A7FBB', marginBottom: 8 }}>Your dedicated AI mobile number</div>
                <div style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: 2, color: 'white', marginBottom: 8 }}>+61 489 274 531</div>
                <div style={{ fontSize: 13, color: '#4A7FBB' }}>Australian mobile · Active now · Can send & receive SMS</div>
              </div>

              <div style={{ background: '#071829', borderRadius: 14, padding: 20, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#4A9FE8', marginBottom: 14 }}>📋 How to divert your calls — 3 steps</div>
                {[
                  ['Divert ALL calls to your AI number', 'On your phone, dial: ', '**21*+61489274531#', ' then press Call'],
                  ['Test the divert', 'Call your business number from another phone — your AI should answer within 2 rings', '', ''],
                  ["You're done", 'Watch calls appear on your dashboard in real time', '', ''],
                ].map(([title, desc, code, after], i) => (
                  <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: i < 2 ? 14 : 0 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#E8622A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{i + 1}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'white', marginBottom: 3 }}>{title}</div>
                      <div style={{ fontSize: 13, color: '#4A7FBB' }}>
                        {desc}
                        {code && <code style={{ background: '#061322', padding: '2px 8px', borderRadius: 6, color: '#4A9FE8', fontFamily: 'monospace' }}>{code}</code>}
                        {after}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ padding: 14, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, fontSize: 13, color: '#7BAED4' }}>
                📧 Full instructions + your number have been emailed to <strong style={{ color: 'white' }}>{(responses.businessName as string) || 'you'}</strong>
              </div>
            </div>
          )}

          {/* STEP 11: You're Live */}
          {currentStep === 11 && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'white', marginBottom: 8 }}>You&apos;re live!</h2>
              <p style={{ color: '#7BAED4', fontSize: 15, lineHeight: 1.6, maxWidth: 400, margin: '0 auto 28px' }}>
                Your AI agent is active and answering calls right now. Head to your dashboard to watch the calls come in.
              </p>
              <div style={{ background: '#071829', borderRadius: 14, padding: 20, marginBottom: 24, textAlign: 'left' }}>
                {[
                  ['Business', (responses.businessName as string) || '—'],
                  ['AI Number', '+61 489 274 531'],
                  ['Voice', voices.find(v => v.id === voice)?.name || 'Sarah'],
                  ['Plan', 'Starter · $299/month'],
                  ['Status', '🟢 Live & Active'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: k !== 'Status' ? '1px solid rgba(255,255,255,0.06)' : 'none', fontSize: 14 }}>
                    <span style={{ color: '#4A7FBB' }}>{k}</span>
                    <span style={{ color: 'white', fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
              <button onClick={goLive} disabled={loading}
                style={{ width: '100%', padding: '16px', background: '#E8622A', color: 'white', border: 'none', borderRadius: 14, fontFamily: 'Outfit,sans-serif', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>
                {loading ? '⚡ Setting up...' : 'Go to My Dashboard →'}
              </button>
            </div>
          )}

          {/* Navigation */}
          {currentStep < 11 && currentStep !== 9 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={back} disabled={currentStep === 1}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 20px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#4A7FBB', borderRadius: 10, fontFamily: 'Outfit,sans-serif', fontSize: 14, fontWeight: 500, cursor: currentStep === 1 ? 'not-allowed' : 'pointer', opacity: currentStep === 1 ? 0.4 : 1 }}>
                <ChevronLeft size={16} /> Back
              </button>
              <button onClick={currentStep === 8 && !agreed ? () => alert('Please read and agree to the Service Agreement to continue.') : next}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 28px', background: '#E8622A', color: 'white', border: 'none', borderRadius: 10, fontFamily: 'Outfit,sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {loading ? 'Saving…' : 'Next'} <ChevronRight size={16} />
              </button>
            </div>
          )}

          {currentStep === 10 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={next} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 28px', background: '#E8622A', color: 'white', border: 'none', borderRadius: 10, fontFamily: 'Outfit,sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Continue <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
