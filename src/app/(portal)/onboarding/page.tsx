'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useOnboardingStore } from '@/store/onboarding-store'
import { BUSINESS_TYPE_CONFIG, BUSINESS_TYPE_LABELS, type BusinessType } from '@/lib/business-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronRight, ChevronLeft, Check } from 'lucide-react'

const STEPS = ['Business', 'Hours', 'Catalog', 'Voice', 'FAQs', 'Escalation', 'Notifications', 'Go Live!']
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const AU_TZ = ['Australia/Brisbane', 'Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Hobart']

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const { currentStep, responses, setStep, setResponse, reset } = useOnboardingStore()
  const [loading, setLoading] = useState(false)
  const [businessId, setBusinessId] = useState('')
  const [businessType, setBusinessType] = useState<BusinessType>('other')

  const config = BUSINESS_TYPE_CONFIG[businessType || (responses.businessType as BusinessType) || 'other']

  async function saveStep() {
    const supabaseClient = supabase
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) return
    const { data: biz } = await supabaseClient.from('businesses').select('id, business_type').eq('owner_user_id', user.id).single()
    if (!biz) return
    setBusinessId(biz.id)
    setBusinessType(biz.business_type as BusinessType)
    await supabaseClient.from('onboarding_responses').upsert({ business_id: biz.id, current_step: currentStep + 1, responses }, { onConflict: 'business_id' })
  }

  async function next() {
    setLoading(true)
    await saveStep()
    setStep(currentStep + 1)
    setLoading(false)
  }

  function back() { setStep(currentStep - 1) }

  async function goLive() {
    setLoading(true)
    await saveStep()
    const res = await fetch('/api/onboarding/complete', { method: 'POST' })
    if (res.ok) { reset(); router.push('/dashboard') }
    else { alert('Something went wrong — please try again'); setLoading(false) }
  }

  // Default opening hours
  const hours = (responses.openingHours as Record<string, { open: string; close: string; closed: boolean }>) || {}

  // Type-specific FAQ suggestions
  const faqSuggestions = {
    hospitality: [{ question: 'What are your opening hours?', answer: '' }, { question: 'Do you offer delivery?', answer: '' }, { question: 'Can I make a reservation?', answer: '' }, { question: 'Do you cater for dietary requirements?', answer: '' }, { question: 'What is your most popular dish?', answer: '' }],
    medical: [{ question: 'How do I book an appointment?', answer: '' }, { question: 'Do you bulk bill?', answer: '' }, { question: 'How do I get a referral?', answer: '' }, { question: 'What should I bring to my appointment?', answer: '' }, { question: 'Do you offer telehealth?', answer: '' }],
    trades: [{ question: 'Do you offer free quotes?', answer: '' }, { question: 'What areas do you service?', answer: '' }, { question: 'Are you licensed and insured?', answer: '' }, { question: 'How quickly can you attend an emergency?', answer: '' }, { question: 'What payment methods do you accept?', answer: '' }],
    automotive: [{ question: 'What towing services do you offer?', answer: '' }, { question: 'How quickly can you respond?', answer: '' }, { question: 'What areas do you cover?', answer: '' }, { question: 'Do you accept insurance claims?', answer: '' }, { question: 'What payment methods do you accept?', answer: '' }],
    beauty: [{ question: 'How do I book an appointment?', answer: '' }, { question: 'What is your cancellation policy?', answer: '' }, { question: 'Do you offer packages?', answer: '' }, { question: 'Do I need a patch test?', answer: '' }, { question: 'Do you offer gift vouchers?', answer: '' }],
  } as Record<string, Array<{question: string; answer: string}>>

  const defaultFaqs = faqSuggestions[businessType] || [{ question: '', answer: '' }, { question: '', answer: '' }, { question: '', answer: '' }, { question: '', answer: '' }, { question: '', answer: '' }]
  const faqs = (responses.faqs as Array<{question: string; answer: string}>) || defaultFaqs

  // Type-specific catalog templates
  const catalogTemplates: Record<string, Array<{name: string; category: string; price?: number; duration?: number}>> = {
    hospitality: [{ name: 'Fish & Chips', category: 'Mains', price: 12 }, { name: 'Soft Drink', category: 'Drinks', price: 3 }],
    medical: [{ name: 'GP Consultation', category: 'GP', duration: 15 }, { name: 'Telehealth', category: 'Telehealth', duration: 20 }],
    trades: [{ name: 'Emergency Callout', category: 'Emergency' }, { name: 'Free Quote', category: 'Quotes' }],
    automotive: [{ name: 'Emergency Tow', category: 'Emergency' }, { name: 'Scheduled Service', category: 'Servicing' }],
    beauty: [{ name: 'Haircut & Style', category: 'Hair', price: 65, duration: 60 }, { name: 'Full Colour', category: 'Hair', price: 150, duration: 120 }],
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start py-12 px-4" style={{ background: '#061322' }}>
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: '#E8622A' }}>
            <svg viewBox="0 0 36 36" width="28" height="28"><rect x="6" y="8" width="24" height="5" rx="2.5" fill="white"/><rect x="14" y="8" width="8" height="22" rx="2.5" fill="white"/></svg>
          </div>
          <div>
            <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 800, letterSpacing: '-2px', color: 'white', fontSize: '1.4rem' }}>talk</span>
            <span style={{ fontFamily: 'Outfit,sans-serif', fontWeight: 300, letterSpacing: '4px', color: '#4A9FE8', fontSize: '1.4rem' }}>mate</span>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: i < currentStep ? '#22c55e' : i === currentStep - 1 ? '#E8622A' : 'rgba(255,255,255,0.08)', color: 'white' }}>
                {i < currentStep - 1 ? <Check size={13} /> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className="h-0.5 flex-1" style={{ background: i < currentStep - 1 ? '#22c55e' : 'rgba(255,255,255,0.08)' }} />}
            </div>
          ))}
        </div>
        <p className="text-xs mb-8" style={{ color: '#4A7FBB' }}>Step {currentStep} of {STEPS.length}: {STEPS[currentStep - 1]}</p>

        <div className="p-8 rounded-2xl border" style={{ background: '#0A1E38', borderColor: 'rgba(232,98,42,0.2)' }}>
          {/* Step 1: Business details */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white mb-6">Tell us about your business</h2>
              {[['Business Name', 'businessName', 'My Business'], ['Phone Number', 'phone', '+61 4XX XXX XXX'], ['Address', 'address', '123 Main St, Brisbane QLD 4000'], ['Website', 'website', 'www.mybusiness.com.au'], ['ABN', 'abn', '12 345 678 901']].map(([label, key, placeholder]) => (
                <div key={key}>
                  <Label className="text-xs mb-1.5 block" style={{ color: '#4A7FBB' }}>{label}</Label>
                  <Input value={(responses[key as keyof typeof responses] as string) || ''} onChange={e => setResponse(key as keyof typeof responses, e.target.value)} placeholder={placeholder}
                    style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                </div>
              ))}
              <div>
                <Label className="text-xs mb-1.5 block" style={{ color: '#4A7FBB' }}>Timezone</Label>
                <Select value={(responses.timezone as string) || 'Australia/Brisbane'} onValueChange={v => setResponse('timezone', v)}>
                  <SelectTrigger style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: '#0A1E38' }}>
                    {AU_TZ.map(tz => <SelectItem key={tz} value={tz} style={{ color: 'white' }}>{tz}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 2: Opening hours */}
          {currentStep === 2 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-6">Opening hours</h2>
              <div className="space-y-3">
                {DAYS.map(day => {
                  const h = hours[day] || { open: '09:00', close: '17:00', closed: false }
                  return (
                    <div key={day} className="flex items-center gap-4">
                      <span className="w-24 text-sm text-white">{day}</span>
                      <Switch checked={!h.closed} onCheckedChange={v => setResponse('openingHours', { ...hours, [day]: { ...h, closed: !v } })} />
                      {!h.closed && (
                        <>
                          <Input type="time" value={h.open} onChange={e => setResponse('openingHours', { ...hours, [day]: { ...h, open: e.target.value } })}
                            style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white', width: 110 }} />
                          <span style={{ color: '#4A7FBB' }}>to</span>
                          <Input type="time" value={h.close} onChange={e => setResponse('openingHours', { ...hours, [day]: { ...h, close: e.target.value } })}
                            style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white', width: 110 }} />
                        </>
                      )}
                      {h.closed && <span className="text-sm" style={{ color: '#4A7FBB' }}>Closed</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 3: Catalog */}
          {currentStep === 3 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-2">Your {config.catalogLabel}</h2>
              <p className="text-sm mb-6" style={{ color: '#4A7FBB' }}>We've pre-filled some examples. Edit them or add your own. You can update these anytime in the portal.</p>
              <div className="p-4 rounded-xl" style={{ background: '#071829' }}>
                {(catalogTemplates[businessType] || catalogTemplates.trades).map((item, i) => (
                  <div key={i} className="flex items-center gap-3 mb-3">
                    <span className="text-sm text-white flex-1">{item.name}</span>
                    <span className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(74,159,232,0.1)', color: '#4A9FE8' }}>{item.category}</span>
                    {item.price && <span className="text-sm font-semibold" style={{ color: '#E8622A' }}>${item.price}</span>}
                  </div>
                ))}
                <p className="text-xs mt-3" style={{ color: '#4A7FBB' }}>✏️ You can fully manage your {config.catalogLabel.toLowerCase()} in the portal after setup.</p>
              </div>
            </div>
          )}

          {/* Step 4: Voice */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white mb-6">Your AI voice agent</h2>
              <div>
                <Label className="text-xs mb-1.5 block" style={{ color: '#4A7FBB' }}>Greeting message</Label>
                <Textarea value={(responses.greeting as string) || `Thank you for calling ${responses.businessName || 'us'}. How can I help you today?`}
                  onChange={e => setResponse('greeting', e.target.value)} rows={3}
                  style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block" style={{ color: '#4A7FBB' }}>Tone</Label>
                <div className="flex gap-3">
                  {['Professional', 'Friendly', 'Casual'].map(t => (
                    <button key={t} onClick={() => setResponse('tone', t)} className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
                      style={{ background: responses.tone === t ? '#E8622A' : 'rgba(255,255,255,0.06)', color: 'white' }}>{t}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 5: FAQs */}
          {currentStep === 5 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-2">Custom FAQs</h2>
              <p className="text-sm mb-6" style={{ color: '#4A7FBB' }}>Questions your AI agent will answer on every call.</p>
              <div className="space-y-4">
                {faqs.map((faq, i) => (
                  <div key={i} className="p-4 rounded-xl" style={{ background: '#071829' }}>
                    <Input placeholder={`Question ${i + 1}`} value={faq.question} onChange={e => { const f = [...faqs]; f[i] = { ...f[i], question: e.target.value }; setResponse('faqs', f) }}
                      className="mb-2" style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                    <Textarea placeholder="Answer" value={faq.answer} onChange={e => { const f = [...faqs]; f[i] = { ...f[i], answer: e.target.value }; setResponse('faqs', f) }} rows={2}
                      style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 6: Escalation rules */}
          {currentStep === 6 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-2">Escalation rules</h2>
              <p className="text-sm mb-6" style={{ color: '#4A7FBB' }}>When should your AI transfer a call to you?</p>
              <Textarea value={(responses.escalationRules as string) || config.escalationTemplate}
                onChange={e => setResponse('escalationRules', e.target.value)} rows={6}
                style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
              {config.complianceRule && (
                <div className="mt-4 p-4 rounded-xl border" style={{ background: 'rgba(232,98,42,0.08)', borderColor: 'rgba(232,98,42,0.3)' }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: '#E8622A' }}>🔒 Locked compliance rule</p>
                  <p className="text-sm" style={{ color: '#7BAED4' }}>{config.complianceRule}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 7: Notifications */}
          {currentStep === 7 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white mb-6">Notification preferences</h2>
              {[['emailOnTransfer', 'Email me when a call is transferred'], ['dailySummary', 'Daily summary email'], ['weeklyReport', 'Weekly report email']].map(([key, label]) => (
                <div key={key} className="flex items-center justify-between p-4 rounded-xl" style={{ background: '#071829' }}>
                  <span className="text-sm text-white">{label}</span>
                  <Switch checked={!!(responses.notifications as Record<string, boolean>)?.[key]} onCheckedChange={v => setResponse('notifications', { ...(responses.notifications as object || {}), [key]: v })} />
                </div>
              ))}
            </div>
          )}

          {/* Step 8: Go live */}
          {currentStep === 8 && (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-white mb-3">You're ready to go live!</h2>
              <p className="text-sm mb-8" style={{ color: '#7BAED4' }}>
                Clicking below will create your AI agent, configure it with everything you've told us, and send you a confirmation email.
              </p>
              <div className="p-4 rounded-xl mb-8 text-left" style={{ background: '#071829' }}>
                {[['Business', responses.businessName as string], ['Type', BUSINESS_TYPE_LABELS[businessType as BusinessType] || businessType], ['Timezone', responses.timezone as string || 'Australia/Brisbane']].map(([l, v]) => (
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

          {/* Nav buttons */}
          {currentStep < 8 && (
            <div className="flex justify-between mt-8">
              <Button variant="outline" onClick={back} disabled={currentStep === 1} className="gap-2"
                style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#4A7FBB' }}>
                <ChevronLeft size={16} /> Back
              </Button>
              <Button onClick={next} disabled={loading} className="gap-2" style={{ background: '#E8622A', color: 'white', border: 'none' }}>
                {loading ? 'Saving…' : 'Next'} <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
