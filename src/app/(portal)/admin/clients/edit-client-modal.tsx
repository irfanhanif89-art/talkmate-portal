'use client'

import { useEffect, useState } from 'react'
import { AdminBusiness, INDUSTRIES, PLAN_OPTIONS, planAud, planLabel } from './types'
import { ModalShell } from './create-client-modal'

// ── Services library — quick-add chips per industry ───────────────────────────
const SERVICES_LIBRARY: Record<string, { label: string; icon: string; text: string }[]> = {
  automotive: [
    {
      label: 'Plant & Machinery',
      icon: '🏗️',
      text: 'Plant & Machinery Transport — Tilt tray service for excavators, bobcats, compactors, forklifts, rollers and other heavy equipment. Capacity up to 11 tonne / 8.5m length. Available in 4T, 7T and 11T trucks depending on equipment size. Pricing based on distance. Jobs over 100km are price on application (POA). Extra attachments quoted on request. Toll fees apply on routes using Citylink or Eastlink.',
    },
    {
      label: '20ft Containers',
      icon: '📦',
      text: '20ft Shipping Container Transport — Empty and loaded container moves within 100km. Account rates available for approved clients (Budget Self Pack, 21 Logistics and similar). Retail rates apply for all others. Chain booking fee applies for container park pickups. Weighbridge fee applies for international port destinations. Tolls extra where applicable. Jobs over 100km are price on application.',
    },
    {
      label: 'Cars & Light Vehicles',
      icon: '🚗',
      text: 'Car & Light Vehicle Towing — Towing and transport for sedans, hatchbacks, SUVs, utes and 4WDs. Flatbed tilt tray or wheel-lift available. Local and metro distances covered. Pricing based on distance and vehicle type.',
    },
    {
      label: 'Breakdown Recovery',
      icon: '🔧',
      text: 'Breakdown & Accident Recovery — Roadside breakdown response, vehicle recovery from accident scenes, off-road recovery and after-hours emergency towing. Available 24/7. After-hours surcharge may apply.',
    },
    {
      label: 'Motorcycles',
      icon: '🏍️',
      text: 'Motorcycle Transport — Safe towing and transport of motorcycles, scooters and dirt bikes. Secure tie-down strapping. Local and metro coverage.',
    },
    {
      label: 'Heavy Vehicles',
      icon: '🚛',
      text: 'Heavy Vehicle Recovery & Transport — Recovery and transport of trucks, semi-trailers, buses and other heavy vehicles. Pricing on application based on size, weight and job complexity.',
    },
  ],
  trades: [
    {
      label: 'Service Calls',
      icon: '🔨',
      text: 'Service calls and on-site inspections. Emergency callouts available. Standard and after-hours rates apply. Travel charge applies beyond standard service area.',
    },
    {
      label: 'Quotes',
      icon: '📋',
      text: 'Free quotes available for all work. Quote valid for 30 days. Fixed-price and hourly options depending on job type.',
    },
    {
      label: 'Maintenance',
      icon: '⚙️',
      text: 'Scheduled maintenance and preventative servicing. Annual service plans available. Discounts for ongoing maintenance contracts.',
    },
    {
      label: 'Emergency',
      icon: '🚨',
      text: '24/7 emergency response available. Priority dispatch for urgent callouts. After-hours rates apply.',
    },
  ],
  hospitality: [
    {
      label: 'Bookings',
      icon: '📅',
      text: 'Table reservations accepted for lunch and dinner service. Group bookings welcome. Cancellation policy: 24 hours notice required for groups of 8 or more.',
    },
    {
      label: 'Takeaway',
      icon: '🥡',
      text: 'Takeaway and pickup orders available. Online ordering available. Estimated wait times provided at time of order.',
    },
    {
      label: 'Functions',
      icon: '🎉',
      text: 'Private functions and events catering available. Seated and cocktail-style events. Minimum spend applies. Contact us for a functions package.',
    },
    {
      label: 'Catering',
      icon: '🍽️',
      text: 'Offsite catering available for corporate events, private parties and community events. Minimum 48 hours notice required. Delivery fees apply.',
    },
  ],
  medical: [
    {
      label: 'Consultations',
      icon: '🩺',
      text: 'Standard and extended consultations available. Bulk billing available for eligible patients. Telehealth appointments available.',
    },
    {
      label: 'Appointments',
      icon: '📅',
      text: 'Same-day and next-day appointments available where possible. Online booking available. Cancellation required at least 2 hours before appointment time.',
    },
    {
      label: 'Procedures',
      icon: '💉',
      text: 'Minor procedures and treatments available on-site. Pre-procedure preparation instructions provided at time of booking.',
    },
    {
      label: 'Referrals',
      icon: '📄',
      text: 'Specialist referrals arranged as needed. Scripts and repeat scripts available at appointment or via phone request.',
    },
  ],
  beauty: [
    {
      label: 'Hair',
      icon: '✂️',
      text: 'Haircuts, colours, highlights, balayage, blowdries and styling. Consultation included for colour services. Prices vary based on hair length and service.',
    },
    {
      label: 'Nails',
      icon: '💅',
      text: 'Manicures, pedicures, gel, acrylic and nail art. Removal service available. Prices based on nail type and length.',
    },
    {
      label: 'Treatments',
      icon: '🧖',
      text: 'Facial treatments, skin care, waxing and body treatments available. Patch test required for some services — please advise allergies at time of booking.',
    },
    {
      label: 'Bookings',
      icon: '📅',
      text: 'Appointments available 7 days. Online booking preferred. Walk-ins welcome subject to availability. Deposit required for some services.',
    },
  ],
  fitness: [
    {
      label: 'Memberships',
      icon: '🏋️',
      text: 'Casual, weekly and monthly memberships available. No joining fee. Freeze options available. Student and senior discounts apply.',
    },
    {
      label: 'Personal Training',
      icon: '💪',
      text: 'One-on-one personal training sessions available. Programs tailored to individual goals. Packages of 5, 10 and 20 sessions available at discounted rates.',
    },
    {
      label: 'Classes',
      icon: '🧘',
      text: 'Group fitness classes available. Timetable on website. Booking required for popular classes. Included with all memberships.',
    },
    {
      label: 'Enquiries',
      icon: '📞',
      text: 'Free initial consultation available. Tour of facilities on request. Speak to one of our team about the best membership option for your goals.',
    },
  ],
  real_estate: [
    {
      label: 'Sales',
      icon: '🏠',
      text: 'Residential and commercial property sales. Free appraisals available. Auction and private treaty options. Market updates provided.',
    },
    {
      label: 'Property Management',
      icon: '🔑',
      text: 'Full property management service including tenant sourcing, rent collection, maintenance coordination and inspections. Competitive management fees.',
    },
    {
      label: 'Rentals',
      icon: '📋',
      text: 'Rental applications and availability enquiries. Property inspections by appointment. Application processing within 24 business hours.',
    },
    {
      label: 'Appraisals',
      icon: '📊',
      text: 'Free property appraisals for sales and rentals. Market comparables provided. No obligation.',
    },
  ],
  professional: [
    {
      label: 'Consultations',
      icon: '💼',
      text: 'Initial consultations available. Fixed-fee and hourly billing options. Confidential discussions. Please have relevant documents ready.',
    },
    {
      label: 'Appointments',
      icon: '📅',
      text: 'Appointments available in-office, via phone and video call. Same-week availability for urgent matters.',
    },
    {
      label: 'Documents',
      icon: '📄',
      text: 'Document preparation, review and execution available. Turnaround times vary by matter complexity. Rush service available on request.',
    },
  ],
}

const SERVICES_FALLBACK = [
  { label: 'General Services', icon: '⚡', text: 'General services and enquiries handled. Pricing available on request. Contact us for a quote or to discuss your requirements.' },
  { label: 'Bookings', icon: '📅', text: 'Appointments and bookings accepted. Availability enquiries welcome. Confirmation sent at time of booking.' },
  { label: 'Quotes', icon: '📋', text: 'Free quotes available. Response within 1 business day. No obligation.' },
]

function ServicesQuickAdd({ industry, value, onChange }: { industry: string; value: string; onChange: (v: string) => void }) {
  const chips = SERVICES_LIBRARY[industry] ?? SERVICES_FALLBACK

  function toggle(text: string) {
    if (value.includes(text)) {
      // Remove it
      onChange(value.replace('\n\n' + text, '').replace(text + '\n\n', '').replace(text, '').trim())
    } else {
      // Add it
      onChange(value ? value.trim() + '\n\n' + text : text)
    }
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <p style={{ fontSize: 11, color: '#7BAED4', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Quick add services
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {chips.map(chip => {
          const active = value.includes(chip.text.slice(0, 40))
          return (
            <button
              key={chip.label}
              type="button"
              onClick={() => toggle(chip.text)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 20,
                border: `1px solid ${active ? '#E8622A' : 'rgba(255,255,255,0.12)'}`,
                background: active ? 'rgba(232,98,42,0.15)' : 'rgba(255,255,255,0.04)',
                color: active ? '#E8622A' : '#C8D8EA',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'Outfit, sans-serif',
                transition: 'all 0.15s',
              }}
            >
              <span>{chip.icon}</span>
              <span>{chip.label}</span>
              {active && <span style={{ fontSize: 14, lineHeight: 1 }}>×</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

type Tab = 'details' | 'agent' | 'billing' | 'history'

export default function EditClientModal({
  business, onClose, onUpdate, onCancelled,
}: {
  business: AdminBusiness
  onClose: () => void
  onUpdate: (patch: Partial<AdminBusiness>) => void
  onCancelled: () => void
}) {
  const [tab, setTab] = useState<Tab>('details')

  return (
    <ModalShell onClose={onClose}>
      <div style={{ marginBottom: 4 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', margin: 0 }}>{business.name}</h2>
        <p style={{ fontSize: 12, color: '#7BAED4', margin: '4px 0 0 0' }}>
          ID: <code style={{ fontSize: 11 }}>{business.id}</code>
        </p>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(255,255,255,0.07)', marginTop: 18, marginBottom: 22 }}>
        {(['details', 'agent', 'billing', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 16px', fontSize: 13, fontWeight: 600,
              background: 'transparent', border: 'none',
              borderBottom: `2px solid ${tab === t ? '#E8622A' : 'transparent'}`,
              color: tab === t ? 'white' : '#7BAED4', cursor: 'pointer',
              fontFamily: 'Outfit, sans-serif',
            }}
          >{t === 'details' ? 'Details' : t === 'agent' ? 'Agent Setup' : t === 'billing' ? 'Billing' : 'History'}</button>
        ))}
      </div>

      {tab === 'details' && <DetailsTab business={business} onUpdate={onUpdate} onCancelled={onCancelled} />}
      {tab === 'agent' && <AgentTab business={business} onUpdate={onUpdate} />}
      {tab === 'billing' && <BillingTab business={business} onUpdate={onUpdate} />}
      {tab === 'history' && <HistoryTab business={business} />}
    </ModalShell>
  )
}

// ── Details tab ────────────────────────────────────────────────────────────

function DetailsTab({
  business, onUpdate, onCancelled,
}: {
  business: AdminBusiness
  onUpdate: (patch: Partial<AdminBusiness>) => void
  onCancelled: () => void
}) {
  const [form, setForm] = useState({
    business_name: business.name,
    phone: business.phone_number ?? '',
    address: business.address ?? '',
    website: business.website ?? '',
    abn: business.abn ?? '',
    industry: business.industry ?? 'restaurants',
    plan: (business.plan === 'professional' ? 'pro' : (business.plan ?? 'starter')) as 'starter' | 'growth' | 'pro',
    account_status: (business.account_status ?? 'pending') as AdminBusiness['account_status'],
  })
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCancel, setShowCancel] = useState(false)

  async function save() {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/admin/clients/${business.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Save failed')
      onUpdate({
        name: form.business_name,
        phone_number: form.phone,
        address: form.address || null,
        website: form.website || null,
        abn: form.abn || null,
        industry: form.industry,
        plan: form.plan,
        account_status: form.account_status,
      })
      setSavedAt(new Date().toLocaleTimeString('en-AU'))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function suspend() {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/admin/clients/${business.id}/suspend`, { method: 'POST' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed')
      setForm(f => ({ ...f, account_status: 'suspended' }))
      onUpdate({ account_status: 'suspended' })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Grid>
        <Field label="Business name"><Input value={form.business_name} onChange={v => setForm(f => ({ ...f, business_name: v }))} /></Field>
        <Field label="Phone"><Input value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} /></Field>
        <Field label="Address"><Input value={form.address} onChange={v => setForm(f => ({ ...f, address: v }))} /></Field>
        <Field label="Website"><Input value={form.website} onChange={v => setForm(f => ({ ...f, website: v }))} /></Field>
        <Field label="ABN"><Input value={form.abn} onChange={v => setForm(f => ({ ...f, abn: v }))} /></Field>
        <Field label="Industry">
          <Select value={form.industry} onChange={v => setForm(f => ({ ...f, industry: v }))} options={INDUSTRIES} />
        </Field>
        <Field label="Plan">
          <Select
            value={form.plan}
            onChange={v => setForm(f => ({ ...f, plan: v as 'starter' | 'growth' | 'pro' }))}
            options={PLAN_OPTIONS.map(p => ({ value: p.value, label: `${p.label} ($${p.price}/mo)` }))}
          />
        </Field>
        <Field label="Account status">
          <Select
            value={form.account_status ?? 'pending'}
            onChange={v => setForm(f => ({ ...f, account_status: v as AdminBusiness['account_status'] }))}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'active', label: 'Active' },
              { value: 'suspended', label: 'Suspended' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
        </Field>
      </Grid>

      <div style={{ marginTop: 16, padding: 14, background: '#071829', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Read-only</p>
        <ReadRow label="Onboarded by" value={business.onboarded_by ?? '—'} />
        <ReadRow label="Created" value={new Date(business.created_at).toLocaleString('en-AU')} />
        <ReadRow label="T&C accepted" value={business.tos_accepted_at ? `Yes — ${new Date(business.tos_accepted_at).toLocaleDateString('en-AU')} (v${business.tos_accepted_version})` : 'No'} />
      </div>

      {error && <Err msg={error} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
        <span style={{ fontSize: 12, color: '#22C55E' }}>{savedAt ? `Saved ${savedAt}` : ''}</span>
        <button onClick={save} disabled={saving} style={primary(saving)}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>

      {/* Danger zone */}
      <div style={{ marginTop: 28, paddingTop: 22, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Danger zone</h4>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={suspend} disabled={saving || form.account_status === 'suspended'} style={amberBtn()}>Suspend account</button>
          <button onClick={() => setShowCancel(true)} disabled={saving} style={dangerBtn()}>Cancel account</button>
        </div>
      </div>

      {showCancel && (
        <CancelConfirm
          businessId={business.id}
          businessName={business.name}
          onClose={() => setShowCancel(false)}
          onCancelled={() => { setShowCancel(false); onCancelled(); setForm(f => ({ ...f, account_status: 'cancelled' })) }}
        />
      )}
    </div>
  )
}

function CancelConfirm({
  businessId, businessName, onClose, onCancelled,
}: { businessId: string; businessName: string; onClose: () => void; onCancelled: () => void }) {
  const [reason, setReason] = useState('')
  const [pauseOffer, setPauseOffer] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function go() {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/clients/${businessId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, send_pause_offer: pauseOffer }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed')
      onCancelled()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 style={{ fontSize: 18, fontWeight: 800, color: 'white', marginTop: 0, marginBottom: 4 }}>Cancel {businessName}?</h3>
      <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 18 }}>
        This will cancel any active Stripe subscription and mark the account as cancelled.
      </p>
      <Field label="Reason (logged in admin notes)">
        <TextArea value={reason} onChange={setReason} placeholder="e.g. Closing the business / switching to a competitor" />
      </Field>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, marginBottom: 18, color: 'white', fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={pauseOffer} onChange={e => setPauseOffer(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#E8622A' }} />
        Send pause offer email instead of standard cancellation comms
      </label>
      {err && <Err msg={err} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button onClick={onClose} style={ghost()}>Keep account</button>
        <button onClick={go} disabled={busy} style={dangerBtn()}>{busy ? 'Cancelling…' : 'Cancel account'}</button>
      </div>
    </ModalShell>
  )
}

// ── Agent Setup tab ────────────────────────────────────────────────────────

function AgentTab({ business, onUpdate }: { business: AdminBusiness; onUpdate: (patch: Partial<AdminBusiness>) => void }) {
  const cfg = (business.notifications_config ?? {}) as Record<string, unknown>
  const [form, setForm] = useState({
    agent_answer_phrase: String(cfg.agent_answer_phrase ?? ''),
    services_summary: String(cfg.services_summary ?? ''),
    after_hours_instruction: String(cfg.after_hours_instruction ?? ''),
    agent_phone_number: business.agent_phone_number ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setSaving(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/clients/${business.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed')
      const newCfg = { ...cfg, agent_answer_phrase: form.agent_answer_phrase, services_summary: form.services_summary, after_hours_instruction: form.after_hours_instruction }
      onUpdate({ agent_phone_number: form.agent_phone_number || null, notifications_config: newCfg })
      setSavedAt(new Date().toLocaleTimeString('en-AU'))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const donnaPrompt = `Donna — please build a TalkMate agent for ${business.name}.

Industry: ${business.industry ?? 'unspecified'}
Plan: ${planLabel(business.plan)}
Answer phrase: "${form.agent_answer_phrase}"
Services: ${form.services_summary}
After hours: ${form.after_hours_instruction}

Once built, enter the agent phone number in the admin panel
under this client's Agent Setup tab and confirm back.`

  return (
    <div>
      <Field label="Answer phrase" full>
        <Input value={form.agent_answer_phrase} onChange={v => setForm(f => ({ ...f, agent_answer_phrase: v }))} />
      </Field>
      <div style={{ marginTop: 14 }}>
        <Field label="Services summary" full>
          <ServicesQuickAdd
            industry={business.industry ?? ''}
            value={form.services_summary}
            onChange={v => setForm(f => ({ ...f, services_summary: v }))}
          />
          <TextArea value={form.services_summary} onChange={v => setForm(f => ({ ...f, services_summary: v }))} />
        </Field>
      </div>
      <div style={{ marginTop: 14 }}>
        <Field label="After hours instruction" full>
          <Input value={form.after_hours_instruction} onChange={v => setForm(f => ({ ...f, after_hours_instruction: v }))} />
        </Field>
      </div>
      <div style={{ marginTop: 14 }}>
        <Field label="Agent phone number" full>
          <Input value={form.agent_phone_number} onChange={v => setForm(f => ({ ...f, agent_phone_number: v }))} placeholder="+61 4xx xxx xxx (set by Donna once agent is built)" />
        </Field>
      </div>

      {err && <Err msg={err} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 22 }}>
        <span style={{ fontSize: 12, color: '#22C55E' }}>{savedAt ? `Saved ${savedAt}` : ''}</span>
        <button onClick={save} disabled={saving} style={primary(saving)}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>

      {/* Donna build prompt */}
      <div style={{ background: '#071829', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Donna build prompt</span>
          <CopyBtn text={donnaPrompt} />
        </div>
        <pre style={{ margin: 0, fontSize: 12, color: 'white', whiteSpace: 'pre-wrap' as const, fontFamily: 'monospace', lineHeight: 1.5 }}>{donnaPrompt}</pre>
      </div>

      {/* Onboarding checklist */}
      <OnboardingChecklist business={business} agentPhone={form.agent_phone_number} />

      <DownloadOnboardingSheetButton business={business} agentPhone={form.agent_phone_number} services={form.services_summary} answerPhrase={form.agent_answer_phrase} afterHours={form.after_hours_instruction} />
    </div>
  )
}

function OnboardingChecklist({ business, agentPhone }: { business: AdminBusiness; agentPhone: string }) {
  const items = [
    { label: 'Account created', done: true },
    { label: 'Payment received', done: business.account_status === 'active' },
    { label: 'Agent built', done: !!agentPhone },
    { label: 'Agent phone number set', done: !!agentPhone },
    { label: 'Welcome email sent', done: !!business.welcome_email_sent },
    { label: 'T&C accepted', done: !!business.tos_accepted_at },
    { label: 'Client first login', done: false }, // Would need auth.users.last_sign_in_at via API
  ]
  return (
    <div style={{ background: '#071829', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: 16, marginTop: 18 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Onboarding checklist</p>
      {items.map(it => (
        <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
          <span style={{
            width: 16, height: 16, borderRadius: 4,
            background: it.done ? '#22C55E' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${it.done ? '#22C55E' : 'rgba(255,255,255,0.1)'}`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: 11, fontWeight: 700,
          }}>{it.done ? '✓' : ''}</span>
          <span style={{ fontSize: 13, color: it.done ? 'white' : '#7BAED4' }}>{it.label}</span>
        </div>
      ))}
    </div>
  )
}

function DownloadOnboardingSheetButton({
  business, agentPhone, services, answerPhrase, afterHours,
}: {
  business: AdminBusiness
  agentPhone: string
  services: string
  answerPhrase: string
  afterHours: string
}) {
  function download() {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Onboarding — ${escapeHtml(business.name)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; max-width: 720px; margin: 40px auto; padding: 28px; color: #061322; }
  h1 { color: #061322; border-bottom: 3px solid #E8622A; padding-bottom: 10px; }
  h2 { color: #4A9FE8; font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 30px; }
  .row { display: flex; padding: 8px 0; border-bottom: 1px solid #eee; }
  .label { width: 200px; color: #6B7280; font-size: 13px; }
  .value { flex: 1; font-size: 14px; }
  .check { width: 16px; height: 16px; border: 2px solid #6B7280; display: inline-block; vertical-align: middle; margin-right: 10px; }
  .item { padding: 8px 0; font-size: 14px; }
  @media print { body { margin: 20px; } }
</style></head><body>
<h1>${escapeHtml(business.name)} — Onboarding sheet</h1>
<p><strong>Plan:</strong> ${escapeHtml(planLabel(business.plan))} · <strong>Industry:</strong> ${escapeHtml(business.industry ?? '—')}</p>
<h2>Business contact</h2>
<div class="row"><div class="label">Phone</div><div class="value">${escapeHtml(business.phone_number ?? '—')}</div></div>
<div class="row"><div class="label">Address</div><div class="value">${escapeHtml(business.address ?? '—')}</div></div>
<div class="row"><div class="label">Website</div><div class="value">${escapeHtml(business.website ?? '—')}</div></div>
<div class="row"><div class="label">ABN</div><div class="value">${escapeHtml(business.abn ?? '—')}</div></div>
<h2>Agent</h2>
<div class="row"><div class="label">Answer phrase</div><div class="value">${escapeHtml(answerPhrase)}</div></div>
<div class="row"><div class="label">Services</div><div class="value">${escapeHtml(services)}</div></div>
<div class="row"><div class="label">After hours</div><div class="value">${escapeHtml(afterHours)}</div></div>
<div class="row"><div class="label">Agent phone</div><div class="value">${escapeHtml(agentPhone || 'not yet set')}</div></div>
<h2>Checklist</h2>
<div class="item"><span class="check"></span> Account created</div>
<div class="item"><span class="check"></span> Payment received</div>
<div class="item"><span class="check"></span> Agent built</div>
<div class="item"><span class="check"></span> Agent phone number set</div>
<div class="item"><span class="check"></span> Welcome email sent</div>
<div class="item"><span class="check"></span> T&amp;C accepted</div>
<div class="item"><span class="check"></span> Client first login</div>
<p style="margin-top:40px;font-size:11px;color:#6B7280">Generated ${new Date().toLocaleString('en-AU')} · TalkMate Admin</p>
</body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `onboarding-${business.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <button onClick={download} style={{ ...ghost(), marginTop: 14, width: '100%' }}>
      Download onboarding sheet (HTML — print to PDF)
    </button>
  )
}

// ── Billing tab ────────────────────────────────────────────────────────────

function BillingTab({ business, onUpdate }: { business: AdminBusiness; onUpdate: (patch: Partial<AdminBusiness>) => void }) {
  const [paymentLink, setPaymentLink] = useState<string | null>(business.stripe_payment_link)
  const [paymentLinkBusy, setPaymentLinkBusy] = useState(false)
  const [override, setOverride] = useState(business.billing_override_note ?? '')
  const [manualDate, setManualDate] = useState(business.manual_next_billing_date ?? '')
  const [savingOverride, setSavingOverride] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  async function generateLink() {
    setPaymentLinkBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/clients/${business.id}/generate-payment-link`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed')
      setPaymentLink(data.url)
      onUpdate({ stripe_payment_link: data.url })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setPaymentLinkBusy(false)
    }
  }

  async function saveOverride() {
    setSavingOverride(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/clients/${business.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_override_note: override,
          manual_next_billing_date: manualDate || null,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed')
      onUpdate({ billing_override_note: override || null, manual_next_billing_date: manualDate || null })
      setSavedAt(new Date().toLocaleTimeString('en-AU'))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSavingOverride(false)
    }
  }

  const ownerFirstName = (business.name.split(' ')[0] ?? 'there').replace(/[^a-zA-Z]/g, '') || 'there'
  const smsTemplate = paymentLink
    ? `Hi ${ownerFirstName}, here's your TalkMate payment link to get started: ${paymentLink}\n\nOnce payment is done everything goes live automatically. Any questions give me a call. — Irfan`
    : 'Generate a payment link first.'

  return (
    <div>
      <Grid>
        <ReadCard label="Plan" value={`${planLabel(business.plan)} · $${planAud(business.plan)}/mo`} />
        <ReadCard label="Account status" value={business.account_status ?? '—'} />
        <ReadCard label="Stripe customer" value={business.stripe_customer_id ?? 'not set'} mono />
      </Grid>

      <h4 style={subSection}>Payment link</h4>
      {paymentLink ? (
        <div style={{ background: '#071829', borderRadius: 10, border: '1px solid rgba(34,197,94,0.3)', padding: 14, marginBottom: 14 }}>
          <p style={{ fontSize: 11, color: '#22C55E', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Active link</p>
          <p style={{ fontSize: 12, color: 'white', wordBreak: 'break-all', fontFamily: 'monospace', marginBottom: 8 }}>{paymentLink}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <CopyBtn text={paymentLink} />
            <button onClick={generateLink} disabled={paymentLinkBusy} style={ghost()}>{paymentLinkBusy ? 'Regenerating…' : 'Regenerate'}</button>
          </div>
        </div>
      ) : (
        <button onClick={generateLink} disabled={paymentLinkBusy} style={primary(paymentLinkBusy)}>
          {paymentLinkBusy ? 'Generating…' : 'Generate payment link'}
        </button>
      )}

      <h4 style={subSection}>SMS template</h4>
      <div style={{ background: '#071829', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', padding: 14, marginBottom: 14 }}>
        <pre style={{ margin: 0, fontSize: 12, color: 'white', whiteSpace: 'pre-wrap' as const, fontFamily: 'monospace', lineHeight: 1.5, marginBottom: 10 }}>{smsTemplate}</pre>
        <CopyBtn text={smsTemplate} disabled={!paymentLink} />
      </div>

      <h4 style={subSection}>Billing override</h4>
      <Grid>
        <Field label="Override note" full>
          <Input value={override} onChange={setOverride} placeholder='e.g. "Founding rate $449/mo locked permanently"' />
        </Field>
        <Field label="Manual next billing date">
          <Input value={manualDate} onChange={setManualDate} type="date" />
        </Field>
      </Grid>

      {err && <Err msg={err} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
        <span style={{ fontSize: 12, color: '#22C55E' }}>{savedAt ? `Saved ${savedAt}` : ''}</span>
        <button onClick={saveOverride} disabled={savingOverride} style={primary(savingOverride)}>
          {savingOverride ? 'Saving…' : 'Save override'}
        </button>
      </div>
    </div>
  )
}

// ── History tab ────────────────────────────────────────────────────────────

interface NoteRow { id: string; note: string; created_at: string }
interface CommsRow { id: string; note: string; logged_by?: string | null; created_at: string }

function HistoryTab({ business }: { business: AdminBusiness }) {
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [comms, setComms] = useState<CommsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [newComm, setNewComm] = useState('')
  const [busy, setBusy] = useState<'note' | 'comm' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [n, c] = await Promise.all([
          fetch(`/api/admin/clients/${business.id}/notes`).then(r => r.json()),
          fetch(`/api/admin/clients/${business.id}/comms-log`).then(r => r.json()),
        ])
        if (cancelled) return
        if (n.ok) setNotes(n.notes)
        if (c.ok) setComms(c.entries)
      } catch (e) {
        if (!cancelled) setErr((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [business.id])

  async function addNote() {
    if (!newNote.trim()) return
    setBusy('note'); setErr(null)
    try {
      const res = await fetch(`/api/admin/clients/${business.id}/notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: newNote.trim() }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed')
      setNotes([data.note, ...notes])
      setNewNote('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function addComm() {
    if (!newComm.trim()) return
    setBusy('comm'); setErr(null)
    try {
      const res = await fetch(`/api/admin/clients/${business.id}/comms-log`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: newComm.trim() }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Failed')
      setComms([data.entry, ...comms])
      setNewComm('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      {err && <Err msg={err} />}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <HistoryColumn
          title="Admin notes"
          accent="#4A9FE8"
          loading={loading}
          rows={notes}
          inputValue={newNote}
          onInput={setNewNote}
          onAdd={addNote}
          busy={busy === 'note'}
          inputPlaceholder="Add an internal note…"
          addLabel="Add note"
        />
        <HistoryColumn
          title="Communication log"
          accent="#E8622A"
          loading={loading}
          rows={comms}
          inputValue={newComm}
          onInput={setNewComm}
          onAdd={addComm}
          busy={busy === 'comm'}
          inputPlaceholder="e.g. Called 29 April 7am — confirmed details, sent payment link"
          addLabel="Log interaction"
        />
      </div>
    </div>
  )
}

function HistoryColumn({
  title, accent, loading, rows, inputValue, onInput, onAdd, busy, inputPlaceholder, addLabel,
}: {
  title: string; accent: string; loading: boolean
  rows: Array<{ id: string; note: string; created_at: string }>
  inputValue: string; onInput: (v: string) => void
  onAdd: () => void; busy: boolean
  inputPlaceholder: string; addLabel: string
}) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{title}</p>
      <div style={{ background: '#071829', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', maxHeight: 280, overflow: 'auto', marginBottom: 10 }}>
        {loading ? (
          <p style={{ padding: 14, fontSize: 12, color: '#7BAED4' }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ padding: 14, fontSize: 12, color: '#7BAED4' }}>No entries yet.</p>
        ) : (
          rows.map((r, i) => (
            <div key={r.id} style={{ padding: 12, borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ fontSize: 11, color: '#7BAED4', marginBottom: 4 }}>{new Date(r.created_at).toLocaleString('en-AU')}</p>
              <p style={{ fontSize: 13, color: 'white', whiteSpace: 'pre-wrap' as const }}>{r.note}</p>
            </div>
          ))
        )}
      </div>
      <TextArea value={inputValue} onChange={onInput} placeholder={inputPlaceholder} />
      <button onClick={onAdd} disabled={busy || !inputValue.trim()} style={{ ...primary(busy), marginTop: 8, width: '100%' }}>
        {busy ? 'Saving…' : addLabel}
      </button>
    </div>
  )
}

// ── Mini UI helpers (kept local to this file to avoid prop drilling) ──────

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>{children}</div>
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#7BAED4', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '10px 14px', borderRadius: 8,
        background: '#071829', border: '1px solid rgba(255,255,255,0.1)',
        color: 'white', fontSize: 13, fontFamily: 'Outfit, sans-serif',
        boxSizing: 'border-box' as const,
      }}
    />
  )
}

function TextArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      style={{
        width: '100%', padding: '10px 14px', borderRadius: 8,
        background: '#071829', border: '1px solid rgba(255,255,255,0.1)',
        color: 'white', fontSize: 13, fontFamily: 'Outfit, sans-serif',
        resize: 'vertical' as const, boxSizing: 'border-box' as const,
      }}
    />
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', padding: '10px 14px', borderRadius: 8,
        background: '#071829', border: '1px solid rgba(255,255,255,0.1)',
        color: 'white', fontSize: 13, fontFamily: 'Outfit, sans-serif', cursor: 'pointer',
        boxSizing: 'border-box' as const,
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
      <span style={{ fontSize: 12, color: '#7BAED4' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'white' }}>{value}</span>
    </div>
  )
}

function ReadCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ background: '#071829', borderRadius: 10, padding: 14, border: '1px solid rgba(255,255,255,0.05)' }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 13, color: 'white', fontFamily: mono ? 'monospace' : 'Outfit, sans-serif', wordBreak: 'break-all' as const }}>{value}</p>
    </div>
  )
}

function Err({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, color: '#EF4444', fontSize: 12, marginTop: 14, marginBottom: 14 }}>{msg}</div>
  )
}

function CopyBtn({ text, disabled }: { text: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      disabled={disabled}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
      }}
      style={{
        padding: '7px 14px', fontSize: 11, fontWeight: 700,
        background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(74,159,232,0.10)',
        border: `1px solid ${copied ? '#22C55E' : 'rgba(74,159,232,0.3)'}`,
        color: copied ? '#22C55E' : '#4A9FE8',
        borderRadius: 7, cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'Outfit, sans-serif', letterSpacing: '0.04em',
        opacity: disabled ? 0.5 : 1,
      }}
    >{copied ? '✓ COPIED' : 'COPY'}</button>
  )
}

function primary(busy: boolean): React.CSSProperties {
  return { padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: busy ? '#7BAED4' : '#E8622A', border: 'none', color: 'white', cursor: busy ? 'wait' : 'pointer', fontFamily: 'Outfit, sans-serif' }
}

function ghost(): React.CSSProperties {
  return { padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'white', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }
}

function amberBtn(): React.CSSProperties {
  return { padding: '9px 16px', borderRadius: 9, fontSize: 12, fontWeight: 700, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.4)', color: '#F59E0B', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }
}

function dangerBtn(): React.CSSProperties {
  return { padding: '9px 16px', borderRadius: 9, fontSize: 12, fontWeight: 700, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }
}

const subSection: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 22, marginBottom: 10 }

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}
