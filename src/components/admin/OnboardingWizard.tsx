'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, Copy, CheckCircle2, Loader2 } from 'lucide-react'
import { SALES_INDUSTRY_SLUGS, SALES_INDUSTRY_LABELS, toSalesIndustrySlug, type SalesIndustrySlug } from '@/lib/industry-slugs'
import ClientCommsLog from './ClientCommsLog'

interface LeadInput {
  id: string
  business_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  industry: string | null
  suburb: string | null
  state: string | null
  website: string | null
  notes: string | null
  won_plan: string | null
  won_billing_cycle: string | null
}

interface BusinessInput {
  id: string
  name: string
  phone_number: string | null
  email: string | null
  address: string | null
  abn: string | null
  website: string | null
  industry: string | null
  trade_type: string | null
  timezone: string | null
  plan: string | null
  billing_cycle: string | null
  account_status: string
  welcome_email_sent: boolean
  temp_password: string | null
  owner_user_id: string | null
  has_agent: boolean
}

type Props =
  | { mode: 'lead'; adminEmail: string; lead: LeadInput; business?: undefined }
  | { mode: 'business'; adminEmail: string; business: BusinessInput; lead?: undefined }

const STEPS = [
  'Business Profile',
  'Agent Configuration',
  'Services and Knowledge Base',
  'Notifications',
  'Go Live Checklist',
] as const

export default function OnboardingWizard(props: Props) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [createdBusinessId, setCreatedBusinessId] = useState<string | null>(
    props.mode === 'business' ? props.business.id : null,
  )
  const [tempPassword, setTempPassword] = useState<string | null>(
    props.mode === 'business' ? props.business.temp_password : null,
  )

  // Step 1 form state
  const initialIndustry = (props.mode === 'lead' ? props.lead.industry : props.business.industry) ?? ''
  const initialSlug = toSalesIndustrySlug(initialIndustry) ?? 'professional'

  const [businessName, setBusinessName] = useState(props.mode === 'lead' ? props.lead.business_name : props.business.name)
  const [phoneNumber, setPhoneNumber] = useState(props.mode === 'lead' ? (props.lead.phone ?? '') : (props.business.phone_number ?? ''))
  const [address, setAddress] = useState(props.mode === 'business' ? (props.business.address ?? '') : '')
  const [abn, setAbn] = useState(props.mode === 'business' ? (props.business.abn ?? '') : '')
  const [website, setWebsite] = useState(props.mode === 'lead' ? (props.lead.website ?? '') : (props.business.website ?? ''))
  const [industry, setIndustry] = useState<SalesIndustrySlug>(initialSlug)
  const [tradeType, setTradeType] = useState(props.mode === 'business' ? (props.business.trade_type ?? '') : '')
  const [timezone, setTimezone] = useState(props.mode === 'business' ? (props.business.timezone ?? 'Australia/Brisbane') : 'Australia/Brisbane')
  const [ownerEmail, setOwnerEmail] = useState(
    props.mode === 'lead' ? (props.lead.email ?? '') : (props.business.email ?? ''),
  )

  const [error, setError] = useState<string | null>(null)
  const [duplicateUserId, setDuplicateUserId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [goLiveResult, setGoLiveResult] = useState<{ ok: boolean; message: string; failing_checks?: string[] } | null>(null)

  async function saveAndCreate() {
    setSaving(true); setError(null); setDuplicateUserId(null)
    const res = await fetch('/api/admin/onboarding-queue/create-from-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: props.mode === 'lead' ? props.lead.id : null,
        business_name: businessName,
        phone_number: phoneNumber,
        address, abn, website, industry, trade_type: tradeType, timezone,
        owner_email: ownerEmail,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.ok) {
      setError(body?.error ?? 'Could not create business.')
      if (body?.existing_user_id) setDuplicateUserId(body.existing_user_id as string)
      setSaving(false)
      return
    }
    setCreatedBusinessId(body.business_id as string)
    setTempPassword((body.temp_password as string | null) ?? null)
    setSaving(false)
  }

  async function copyPassword() {
    if (!tempPassword) return
    try {
      await navigator.clipboard.writeText(tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  async function goLive() {
    if (!createdBusinessId) return
    setSaving(true); setError(null); setGoLiveResult(null)
    const res = await fetch('/api/admin/go-live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: createdBusinessId }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.ok) {
      setGoLiveResult({
        ok: false,
        message: body?.error ?? 'Go Live failed.',
        failing_checks: body?.failing_checks,
      })
    } else {
      setGoLiveResult({ ok: true, message: 'Client activated. Commissions approved. Welcome email queued.' })
      router.refresh()
    }
    setSaving(false)
  }

  const onLeadMode = props.mode === 'lead' && !createdBusinessId

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 22 }}>
      {/* Stepper */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {STEPS.map((label, i) => {
          const idx = i + 1
          const active = step === idx
          const past = step > idx
          return (
            <button
              key={idx} onClick={() => setStep(idx)}
              style={{
                padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                background: active ? 'rgba(232,98,42,0.12)' : past ? 'rgba(34,197,94,0.08)' : 'transparent',
                color: active ? '#E8622A' : past ? '#22c55e' : '#7BAED4',
                border: '1px solid ' + (active ? 'rgba(232,98,42,0.35)' : past ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'),
                fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 700,
              }}
            >
              <span style={{ marginRight: 6 }}>{past ? <Check size={12} style={{ verticalAlign: 'middle' }} /> : idx}</span>
              {label}
            </button>
          )
        })}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <Card title="Business Profile">
          <Grid>
            <Field label="Business name">
              <input value={businessName} onChange={e => setBusinessName(e.target.value)} style={input} />
            </Field>
            <Field label="Phone number (existing line)">
              <input value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} style={input} />
            </Field>
            <Field label="Address">
              <input value={address} onChange={e => setAddress(e.target.value)} style={input} />
            </Field>
            <Field label="ABN">
              <input value={abn} onChange={e => setAbn(e.target.value)} style={input} />
            </Field>
            <Field label="Website">
              <input value={website} onChange={e => setWebsite(e.target.value)} style={input} />
            </Field>
            <Field label="Industry">
              <select value={industry} onChange={e => setIndustry(e.target.value as SalesIndustrySlug)} style={input}>
                {SALES_INDUSTRY_SLUGS.map(s => (
                  <option key={s} value={s}>{SALES_INDUSTRY_LABELS[s]}</option>
                ))}
              </select>
            </Field>
            {industry === 'trades' && (
              <Field label="Trade type">
                <input value={tradeType} onChange={e => setTradeType(e.target.value)} style={input} placeholder="e.g. carpentry, landscaping" />
              </Field>
            )}
            <Field label="Timezone">
              <select value={timezone} onChange={e => setTimezone(e.target.value)} style={input}>
                <option>Australia/Brisbane</option>
                <option>Australia/Sydney</option>
                <option>Australia/Melbourne</option>
                <option>Australia/Adelaide</option>
                <option>Australia/Perth</option>
                <option>Australia/Darwin</option>
                <option>Australia/Hobart</option>
              </select>
            </Field>
            <Field label="Plan (from won deal)">
              <input value={(props.mode === 'lead' ? props.lead.won_plan : props.business.plan) ?? ''} disabled style={{ ...input, opacity: 0.7 }} />
            </Field>
            <Field label="Billing cycle (from won deal)">
              <input value={(props.mode === 'lead' ? props.lead.won_billing_cycle : props.business.billing_cycle) ?? 'monthly'} disabled style={{ ...input, opacity: 0.7 }} />
            </Field>
            <Field label="Owner email (login)" required>
              <input value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} type="email" required style={input} />
            </Field>
          </Grid>

          {error && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 9,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
              color: '#ef4444', fontSize: 13,
            }}>
              {error}
              {duplicateUserId && (
                <div style={{ marginTop: 6 }}>
                  <Link href={`/admin/clients?owner=${duplicateUserId}`} style={{ color: '#E8622A', fontWeight: 700 }}>
                    Open existing client →
                  </Link>
                </div>
              )}
            </div>
          )}

          {createdBusinessId && tempPassword && (
            <div style={{
              marginTop: 14, padding: '14px 18px', borderRadius: 11,
              background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#22c55e', marginBottom: 6 }}>
                <CheckCircle2 size={14} style={{ verticalAlign: 'middle' }} /> Account created
              </div>
              <div style={{ fontSize: 13, color: '#7BAED4', marginBottom: 6 }}>
                Login email: <strong style={{ color: 'white' }}>{ownerEmail}</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <code style={{
                  padding: '6px 12px', borderRadius: 7, fontSize: 14, fontFamily: 'monospace',
                  background: '#061322', color: 'white', border: '1px solid rgba(255,255,255,0.08)',
                }}>{tempPassword}</code>
                <button onClick={copyPassword} style={smallBtn}>
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? ' Copied' : ' Copy'}
                </button>
              </div>
              <p style={{ fontSize: 12, color: '#4A7FBB', marginTop: 8, marginBottom: 0 }}>
                Save or text this to the client now. It will not be shown again after they log in or you re-send welcome.
              </p>
            </div>
          )}

          <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            {onLeadMode ? (
              <button onClick={saveAndCreate} disabled={saving} style={primaryBtn}>
                {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                {saving ? ' Creating account...' : 'Save and Create Business Account'}
              </button>
            ) : (
              <button onClick={() => setStep(2)} style={primaryBtn}>Save and Continue</button>
            )}
          </div>
        </Card>
      )}

      {/* Steps 2-4 (placeholder, existing portal already handles these via admin/clients) */}
      {(step === 2 || step === 3 || step === 4) && (
        <Card title={STEPS[step - 1]}>
          <p style={{ fontSize: 13, color: '#7BAED4', lineHeight: 1.6 }}>
            This step is managed inside the client&apos;s admin profile. Open the client and configure
            {step === 2 ? ' the Vapi agent under Agent' : step === 3 ? ' services and knowledge base under Services / KB' : ' notifications under Settings → Notifications'}.
          </p>
          {createdBusinessId && (
            <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
              <Link href={`/admin/clients/${createdBusinessId}`} style={primaryBtn}>
                Open client profile →
              </Link>
              <button onClick={() => setStep(step + 1)} style={secondaryBtn}>
                I have configured this — continue
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Step 5 */}
      {step === 5 && (
        <Card title="Go Live Checklist">
          {!createdBusinessId ? (
            <p style={{ fontSize: 13, color: '#ef4444' }}>
              Complete Step 1 first to create the business account.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: '#7BAED4', lineHeight: 1.7 }}>
                Provisions a Twilio AU mobile, registers it on Vapi, activates the account, sends the welcome email, and approves the rep&apos;s commission. Will refuse if the go-live checklist has unticked manual items (in the client&apos;s admin profile).
              </p>
              <button onClick={goLive} disabled={saving} style={{ ...primaryBtn, marginTop: 14 }}>
                {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                {saving ? ' Provisioning...' : 'Go Live'}
              </button>
              {goLiveResult && (
                <div style={{
                  marginTop: 14, padding: '12px 16px', borderRadius: 9,
                  background: goLiveResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                  border: '1px solid ' + (goLiveResult.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'),
                  color: goLiveResult.ok ? '#22c55e' : '#ef4444',
                  fontSize: 13,
                }}>
                  {goLiveResult.message}
                  {goLiveResult.failing_checks && goLiveResult.failing_checks.length > 0 && (
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                      {goLiveResult.failing_checks.map(c => <li key={c}>{c}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* Comms log alongside */}
      <Card title="Comms log">
        <ClientCommsLog
          businessId={createdBusinessId ?? undefined}
          leadId={props.mode === 'lead' ? props.lead.id : undefined}
          stage={step === 1 ? 'pre_setup' : 'setup'}
          adminEmail={props.adminEmail}
        />
      </Card>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{
      background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12, padding: 22,
    }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, color: 'white', margin: 0, marginBottom: 12 }}>{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, color: '#7BAED4', fontWeight: 600 }}>
        {label} {required && <span style={{ color: '#E8622A' }}>*</span>}
      </span>
      {children}
    </label>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
      {children}
    </div>
  )
}

const input: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: '#061322', border: '1px solid rgba(255,255,255,0.08)',
  color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none',
}
const primaryBtn: React.CSSProperties = {
  padding: '11px 18px', borderRadius: 9, border: 'none',
  background: '#E8622A', color: 'white',
  fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 700,
  cursor: 'pointer', textDecoration: 'none',
  display: 'inline-flex', alignItems: 'center', gap: 6,
}
const secondaryBtn: React.CSSProperties = {
  padding: '11px 18px', borderRadius: 9,
  background: 'rgba(255,255,255,0.04)', color: '#7BAED4',
  border: '1px solid rgba(255,255,255,0.12)',
  fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}
const smallBtn: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 7,
  background: 'rgba(232,98,42,0.12)', color: '#E8622A',
  border: '1px solid rgba(232,98,42,0.3)',
  fontFamily: 'Outfit, sans-serif', fontSize: 11, fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
}
