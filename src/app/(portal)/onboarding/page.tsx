'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOnboardingStore } from '@/store/onboarding-store'
import { BUSINESS_TYPE_CONFIG, BUSINESS_TYPE_LABELS, type BusinessType } from '@/lib/business-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ChevronRight, ChevronLeft, Check, Plus, Trash2 } from 'lucide-react'

const STEPS = ['Business', 'Hours', 'Catalog', 'Voice', 'FAQs', 'Escalation', 'Notifications', 'Go Live!']
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const AU_TZ = ['Australia/Brisbane', 'Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Hobart']

interface CatalogItem { name: string; category: string; price?: string; description?: string }
interface Faq { question: string; answer: string }
interface HourEntry { open: string; close: string; closed: boolean }
interface Notifications {
  emailOnTransfer: boolean; dailySummary: boolean; weeklyReport: boolean
  whatsapp: boolean; whatsappNumber: string
  telegram: boolean; telegramUsername: string
  urgentCall: boolean; urgentCallNumber: string
  notifEmail: string
}

const defaultHours: Record<string, HourEntry> = {
  Monday: { open: '09:00', close: '17:00', closed: false },
  Tuesday: { open: '09:00', close: '17:00', closed: false },
  Wednesday: { open: '09:00', close: '17:00', closed: false },
  Thursday: { open: '09:00', close: '17:00', closed: false },
  Friday: { open: '09:00', close: '17:00', closed: false },
  Saturday: { open: '09:00', close: '13:00', closed: false },
  Sunday: { open: '09:00', close: '13:00', closed: true },
}

const defaultNotifications: Notifications = {
  emailOnTransfer: true, dailySummary: true, weeklyReport: true,
  whatsapp: false, whatsappNumber: '',
  telegram: false, telegramUsername: '',
  urgentCall: false, urgentCallNumber: '',
  notifEmail: '',
}

const catalogTemplates: Record<string, CatalogItem[]> = {
  hospitality: [{ name: 'Fish & Chips', category: 'Mains', price: '12.00' }, { name: 'Grilled Chicken', category: 'Mains', price: '18.00' }, { name: 'Soft Drink', category: 'Drinks', price: '3.50' }],
  medical: [{ name: 'GP Consultation (Standard)', category: 'GP', description: '15 min appointment' }, { name: 'GP Consultation (Long)', category: 'GP', description: '30 min appointment' }, { name: 'Telehealth Consult', category: 'Telehealth', description: '20 min video call' }],
  trades: [{ name: 'Emergency Callout', category: 'Emergency', description: 'After-hours urgent response' }, { name: 'Free Quote', category: 'Quotes', description: 'No obligation quote' }, { name: 'Scheduled Service', category: 'Services', description: 'Booked in advance' }],
  automotive: [{ name: 'Emergency Tow', category: 'Emergency', description: '24/7 emergency towing' }, { name: 'Roadside Assist', category: 'Roadside', description: 'Jump start, flat tyre, fuel' }, { name: 'Vehicle Transport', category: 'Transport', description: 'Scheduled vehicle transport' }],
  beauty: [{ name: 'Haircut & Style', category: 'Hair', price: '65.00', description: '60 min' }, { name: 'Full Colour', category: 'Hair', price: '150.00', description: '120 min' }, { name: 'Facial', category: 'Skin', price: '90.00', description: '60 min' }],
  other: [{ name: 'Service 1', category: 'General', description: 'Add your description' }, { name: 'Service 2', category: 'General', description: 'Add your description' }],
}

const faqTemplates: Record<string, Faq[]> = {
  hospitality: [{ question: 'What are your opening hours?', answer: '' }, { question: 'Do you offer takeaway/delivery?', answer: '' }, { question: 'Can I make a reservation?', answer: '' }, { question: 'Do you cater for dietary requirements?', answer: '' }],
  medical: [{ question: 'How do I book an appointment?', answer: '' }, { question: 'Do you bulk bill?', answer: '' }, { question: 'What should I bring to my first appointment?', answer: '' }, { question: 'Do you offer telehealth?', answer: '' }],
  trades: [{ question: 'Do you offer free quotes?', answer: '' }, { question: 'What areas do you service?', answer: '' }, { question: 'Are you licensed and insured?', answer: '' }, { question: 'How quickly can you respond to an emergency?', answer: '' }],
  automotive: [{ question: 'What towing services do you offer?', answer: '' }, { question: 'How quickly can you respond?', answer: '' }, { question: 'What areas do you cover?', answer: '' }, { question: 'Do you accept insurance claims?', answer: '' }],
  beauty: [{ question: 'How do I book an appointment?', answer: '' }, { question: 'What is your cancellation policy?', answer: '' }, { question: 'Do you offer gift vouchers?', answer: '' }, { question: 'Do I need a patch test before treatment?', answer: '' }],
  other: [{ question: 'What services do you offer?', answer: '' }, { question: 'How do I get in touch?', answer: '' }, { question: 'What are your prices?', answer: '' }],
}

// Toggle component (no base-ui dependency)
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', padding: 2,
        background: checked ? '#E8622A' : 'rgba(255,255,255,0.15)',
        transition: 'background 0.2s', position: 'relative', flexShrink: 0,
      }}>
      <div style={{
        width: 20, height: 20, borderRadius: 10, background: 'white',
        transform: checked ? 'translateX(20px)' : 'translateX(0)',
        transition: 'transform 0.2s',
      }} />
    </button>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const { currentStep, responses, setStep, setResponse, reset } = useOnboardingStore()
  const [loading, setLoading] = useState(false)
  const [businessType, setBusinessType] = useState<BusinessType>('other')
  const [bizId, setBizId] = useState('')

  // Derived state
  const config = BUSINESS_TYPE_CONFIG[businessType]
  const hours = (responses.openingHours as Record<string, HourEntry>) || defaultHours
  const catalog = (responses.catalog as CatalogItem[]) || catalogTemplates[businessType] || catalogTemplates.other
  const faqs = (responses.faqs as Faq[]) || faqTemplates[businessType] || faqTemplates.other
  const notifs = (responses.notifications as Notifications) || defaultNotifications

  useEffect(() => {
    async function loadBusiness() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: biz } = await supabase.from('businesses').select('id, business_type').eq('owner_user_id', user.id).single()
      if (biz) {
        setBizId(biz.id)
        setBusinessType(biz.business_type as BusinessType)
        if (!responses.catalog) setResponse('catalog', catalogTemplates[biz.business_type] || catalogTemplates.other)
        if (!responses.faqs) setResponse('faqs', faqTemplates[biz.business_type] || faqTemplates.other)
        if (!responses.openingHours) setResponse('openingHours', defaultHours)
        if (!responses.notifications) setResponse('notifications', defaultNotifications)
      }
    }
    loadBusiness()
  }, [])

  async function saveStep() {
    if (!bizId) return
    await supabase.from('onboarding_responses').upsert({ business_id: bizId, current_step: currentStep + 1, responses }, { onConflict: 'business_id' })
  }

  async function next() {
    setLoading(true); await saveStep(); setStep(currentStep + 1); setLoading(false)
  }
  function back() { setStep(currentStep - 1) }

  async function goLive() {
    setLoading(true); await saveStep()
    const res = await fetch('/api/onboarding/complete', { method: 'POST' })
    if (res.ok) { reset(); router.push('/dashboard') }
    else { alert('Something went wrong — please try again'); setLoading(false) }
  }

  // Catalog helpers
  function updateCatalogItem(i: number, field: keyof CatalogItem, value: string) {
    const updated = [...catalog]; updated[i] = { ...updated[i], [field]: value }; setResponse('catalog', updated)
  }
  function addCatalogItem() { setResponse('catalog', [...catalog, { name: '', category: '', price: '', description: '' }]) }
  function removeCatalogItem(i: number) { setResponse('catalog', catalog.filter((_, j) => j !== i)) }

  // FAQ helpers
  function updateFaq(i: number, field: keyof Faq, value: string) {
    const updated = [...faqs]; updated[i] = { ...updated[i], [field]: value }; setResponse('faqs', updated)
  }
  function addFaq() { setResponse('faqs', [...faqs, { question: '', answer: '' }]) }
  function removeFaq(i: number) { setResponse('faqs', faqs.filter((_, j) => j !== i)) }

  function updateHour(day: string, field: keyof HourEntry, value: string | boolean) {
    setResponse('openingHours', { ...hours, [day]: { ...hours[day], [field]: value } })
  }
  function updateNotif(field: keyof Notifications, value: boolean | string) {
    setResponse('notifications', { ...notifs, [field]: value })
  }

  const inputStyle = { background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start py-12 px-4" style={{ background: '#061322' }}>
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: '#E8622A' }}>
            <svg viewBox="0 0 36 36" width="24" height="24" fill="none"><rect x="6" y="8" width="24" height="5" rx="2.5" fill="white"/><rect x="14" y="8" width="8" height="22" rx="2.5" fill="white"/></svg>
          </div>
          <div className="flex items-baseline">
            <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, letterSpacing: '-1px', color: 'white', fontSize: '1.5rem' }}>talk</span>
            <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 300, letterSpacing: '3px', color: '#4A9FE8', fontSize: '1.5rem' }}>mate</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-1 mb-3">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: i < currentStep - 1 ? '#22c55e' : i === currentStep - 1 ? '#E8622A' : 'rgba(255,255,255,0.08)', color: 'white' }}>
                {i < currentStep - 1 ? <Check size={13} /> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className="h-0.5 flex-1" style={{ background: i < currentStep - 1 ? '#22c55e' : 'rgba(255,255,255,0.08)' }} />}
            </div>
          ))}
        </div>
        <p className="text-xs mb-6" style={{ color: '#4A7FBB' }}>Step {currentStep} of {STEPS.length}: <strong style={{ color: 'white' }}>{STEPS[currentStep - 1]}</strong></p>

        <div className="p-8 rounded-2xl border" style={{ background: '#0A1E38', borderColor: 'rgba(232,98,42,0.2)' }}>

          {/* STEP 1: Business Details */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white mb-6">Tell us about your business</h2>
              {[['Business Name', 'businessName', 'My Business Pty Ltd'], ['Phone Number', 'phone', '+61 4XX XXX XXX'], ['Address', 'address', '123 Main St, Brisbane QLD 4000'], ['Website', 'website', 'www.mybusiness.com.au']].map(([label, key, placeholder]) => (
                <div key={key}>
                  <Label className="text-xs mb-1.5 block" style={{ color: '#4A7FBB' }}>{label}</Label>
                  <Input value={(responses[key] as string) || ''} onChange={e => setResponse(key, e.target.value)} placeholder={placeholder} style={inputStyle} />
                </div>
              ))}
              <div>
                <Label className="text-xs mb-1.5 block" style={{ color: '#4A7FBB' }}>Timezone</Label>
                <select value={(responses.timezone as string) || 'Australia/Brisbane'} onChange={e => setResponse('timezone', e.target.value)}
                  style={{ ...inputStyle, width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14 }}>
                  {AU_TZ.map(tz => <option key={tz} value={tz} style={{ background: '#0A1E38' }}>{tz.replace('Australia/', '')}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* STEP 2: Opening Hours */}
          {currentStep === 2 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-6">Opening hours</h2>
              <div className="space-y-3">
                {DAYS.map(day => {
                  const h = hours[day] || defaultHours[day]
                  return (
                    <div key={day} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: '#071829' }}>
                      <span className="w-24 text-sm font-medium text-white">{day}</span>
                      <Toggle checked={!h.closed} onChange={v => updateHour(day, 'closed', !v)} />
                      {!h.closed ? (
                        <div className="flex items-center gap-2 flex-1">
                          <Input type="time" value={h.open} onChange={e => updateHour(day, 'open', e.target.value)}
                            style={{ ...inputStyle, width: 110 }} />
                          <span style={{ color: '#4A7FBB' }}>to</span>
                          <Input type="time" value={h.close} onChange={e => updateHour(day, 'close', e.target.value)}
                            style={{ ...inputStyle, width: 110 }} />
                        </div>
                      ) : (
                        <span className="text-sm" style={{ color: '#4A7FBB' }}>Closed</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* STEP 3: Catalog (editable) */}
          {currentStep === 3 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-2">Your {config.catalogLabel}</h2>
              <p className="text-sm mb-5" style={{ color: '#4A7FBB' }}>Edit, add, or remove items. Your AI agent will use this list when talking to customers.</p>
              <div className="space-y-3 mb-4">
                {catalog.map((item, i) => (
                  <div key={i} className="p-4 rounded-xl" style={{ background: '#071829' }}>
                    <div className="flex gap-2 mb-2">
                      <Input placeholder="Name" value={item.name} onChange={e => updateCatalogItem(i, 'name', e.target.value)} style={{ ...inputStyle, flex: 2 }} />
                      <Input placeholder="Category" value={item.category} onChange={e => updateCatalogItem(i, 'category', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                      {config.hasPricing && (
                        <Input placeholder="$" value={item.price || ''} onChange={e => updateCatalogItem(i, 'price', e.target.value)} style={{ ...inputStyle, width: 80 }} />
                      )}
                      <button onClick={() => removeCatalogItem(i)} style={{ color: '#ef4444', flexShrink: 0 }}><Trash2 size={16} /></button>
                    </div>
                    <Input placeholder="Description (optional)" value={item.description || ''} onChange={e => updateCatalogItem(i, 'description', e.target.value)} style={inputStyle} />
                  </div>
                ))}
              </div>
              <Button onClick={addCatalogItem} variant="outline" className="w-full gap-2"
                style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#4A9FE8', background: 'transparent' }}>
                <Plus size={14} /> Add {config.catalogLabel.slice(0, -1)}
              </Button>
            </div>
          )}

          {/* STEP 4: Voice */}
          {currentStep === 4 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-white mb-4">Your AI voice agent</h2>
              <div>
                <Label className="text-xs mb-1.5 block" style={{ color: '#4A7FBB' }}>Greeting message (what the AI says first)</Label>
                <Textarea value={(responses.greeting as string) || `Thank you for calling ${responses.businessName || 'us'}. How can I help you today?`}
                  onChange={e => setResponse('greeting', e.target.value)} rows={3} style={inputStyle} />
              </div>
              <div>
                <Label className="text-xs mb-2 block" style={{ color: '#4A7FBB' }}>Tone</Label>
                <div className="flex gap-3">
                  {['Professional', 'Friendly', 'Casual'].map(t => (
                    <button key={t} onClick={() => setResponse('tone', t)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                      style={{ background: responses.tone === t ? '#E8622A' : '#071829', color: 'white', border: responses.tone === t ? 'none' : '1px solid rgba(255,255,255,0.1)' }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: FAQs */}
          {currentStep === 5 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-2">Custom FAQs</h2>
              <p className="text-sm mb-5" style={{ color: '#4A7FBB' }}>Questions your AI will answer on every call. Edit or add your own.</p>
              <div className="space-y-3 mb-4">
                {faqs.map((faq, i) => (
                  <div key={i} className="p-4 rounded-xl" style={{ background: '#071829' }}>
                    <div className="flex gap-2 mb-2">
                      <Input placeholder={`Question ${i + 1}`} value={faq.question} onChange={e => updateFaq(i, 'question', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                      <button onClick={() => removeFaq(i)} style={{ color: '#ef4444', flexShrink: 0 }}><Trash2 size={16} /></button>
                    </div>
                    <Textarea placeholder="Answer" value={faq.answer} onChange={e => updateFaq(i, 'answer', e.target.value)} rows={2} style={inputStyle} />
                  </div>
                ))}
              </div>
              <Button onClick={addFaq} variant="outline" className="w-full gap-2"
                style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#4A9FE8', background: 'transparent' }}>
                <Plus size={14} /> Add FAQ
              </Button>
            </div>
          )}

          {/* STEP 6: Escalation */}
          {currentStep === 6 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-2">Escalation rules</h2>
              <p className="text-sm mb-5" style={{ color: '#4A7FBB' }}>Tell the AI when to transfer a call to you instead of handling it.</p>
              <Textarea
                value={(typeof responses.escalationRules === 'string' ? responses.escalationRules : '') || config.escalationTemplate}
                onChange={e => setResponse('escalationRules', e.target.value)}
                rows={7} style={inputStyle} />
              <p className="text-xs mt-2" style={{ color: '#4A7FBB' }}>Example: "Transfer if the caller is angry, asking about refunds, or requesting to speak to a manager."</p>
              {config.complianceRule && (
                <div className="mt-4 p-4 rounded-xl border" style={{ background: 'rgba(232,98,42,0.08)', borderColor: 'rgba(232,98,42,0.3)' }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: '#E8622A' }}>🔒 Locked compliance rule</p>
                  <p className="text-sm" style={{ color: '#7BAED4' }}>{config.complianceRule}</p>
                </div>
              )}
            </div>
          )}

          {/* STEP 7: Notifications */}
          {currentStep === 7 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-2">Notifications</h2>
              <p className="text-sm mb-5" style={{ color: '#4A7FBB' }}>Choose how you want to be alerted when something needs your attention.</p>

              <div className="space-y-3">
                {/* Email section */}
                <div className="p-4 rounded-xl" style={{ background: '#071829' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#4A7FBB' }}>📧 Email</p>
                  <div className="mb-3">
                    <Label className="text-xs mb-1.5 block" style={{ color: '#4A7FBB' }}>Notification email</Label>
                    <Input type="email" placeholder="you@yourbusiness.com.au" value={notifs.notifEmail}
                      onChange={e => updateNotif('notifEmail', e.target.value)} style={inputStyle} />
                  </div>
                  {[['emailOnTransfer', 'Email on every call transfer'], ['dailySummary', 'Daily summary'], ['weeklyReport', 'Weekly report']].map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between py-2">
                      <span className="text-sm text-white">{label}</span>
                      <Toggle checked={!!(notifs as Record<string, unknown>)[key]} onChange={v => updateNotif(key as keyof Notifications, v)} />
                    </div>
                  ))}
                </div>

                {/* WhatsApp */}
                <div className="p-4 rounded-xl" style={{ background: '#071829' }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#4A7FBB' }}>💬 WhatsApp</p>
                    <Toggle checked={notifs.whatsapp} onChange={v => updateNotif('whatsapp', v)} />
                  </div>
                  {notifs.whatsapp && (
                    <Input placeholder="+61 4XX XXX XXX" value={notifs.whatsappNumber}
                      onChange={e => updateNotif('whatsappNumber', e.target.value)} style={inputStyle} />
                  )}
                </div>

                {/* Telegram */}
                <div className="p-4 rounded-xl" style={{ background: '#071829' }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#4A7FBB' }}>✈️ Telegram</p>
                    <Toggle checked={notifs.telegram} onChange={v => updateNotif('telegram', v)} />
                  </div>
                  {notifs.telegram && (
                    <Input placeholder="@yourtelegramusername" value={notifs.telegramUsername}
                      onChange={e => updateNotif('telegramUsername', e.target.value)} style={inputStyle} />
                  )}
                </div>

                {/* Urgent call */}
                <div className="p-4 rounded-xl border" style={{ background: 'rgba(232,98,42,0.06)', borderColor: 'rgba(232,98,42,0.2)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#E8622A' }}>📞 Urgent Call</p>
                      <p className="text-xs mt-0.5" style={{ color: '#7BAED4' }}>Call you when a transfer is urgent</p>
                    </div>
                    <Toggle checked={notifs.urgentCall} onChange={v => updateNotif('urgentCall', v)} />
                  </div>
                  {notifs.urgentCall && (
                    <Input placeholder="+61 4XX XXX XXX" value={notifs.urgentCallNumber}
                      onChange={e => updateNotif('urgentCallNumber', e.target.value)} style={{ ...inputStyle, marginTop: 12 }} />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 8: Go Live */}
          {currentStep === 8 && (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-white mb-3">You&apos;re ready to go live!</h2>
              <p className="text-sm mb-8" style={{ color: '#7BAED4' }}>
                Clicking below will create your AI agent, configure it with everything you&apos;ve told us, and send you a confirmation email.
              </p>
              <div className="p-4 rounded-xl mb-8 text-left" style={{ background: '#071829' }}>
                {[
                  ['Business', responses.businessName as string || '—'],
                  ['Type', BUSINESS_TYPE_LABELS[businessType as BusinessType] || businessType],
                  ['Phone', responses.phone as string || '—'],
                  ['Timezone', ((responses.timezone as string) || 'Australia/Brisbane').replace('Australia/', '')],
                  ['Catalog items', String(catalog.length)],
                  ['FAQs', String(faqs.length)],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between py-2 border-b last:border-0 text-sm" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <span style={{ color: '#4A7FBB' }}>{l}</span>
                    <span className="text-white font-medium">{v}</span>
                  </div>
                ))}
              </div>
              <Button onClick={goLive} disabled={loading} className="w-full py-4 text-lg font-bold"
                style={{ background: '#E8622A', color: 'white', border: 'none' }}>
                {loading ? '⚡ Activating your AI agent…' : '🚀 Go Live Now'}
              </Button>
            </div>
          )}

          {/* Navigation */}
          {currentStep < 8 && (
            <div className="flex justify-between mt-8 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <Button variant="outline" onClick={back} disabled={currentStep === 1} className="gap-2"
                style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#4A7FBB', background: 'transparent' }}>
                <ChevronLeft size={16} /> Back
              </Button>
              <Button onClick={next} disabled={loading} className="gap-2"
                style={{ background: '#E8622A', color: 'white', border: 'none', padding: '0 32px' }}>
                {loading ? 'Saving…' : 'Next'} <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
