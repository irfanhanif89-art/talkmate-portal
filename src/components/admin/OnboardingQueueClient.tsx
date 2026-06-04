'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Phone, Mail, ChevronRight, RotateCcw, CheckCircle2 } from 'lucide-react'
import { timeAgo } from '@/lib/sales-format'
import ClientCommsLog from './ClientCommsLog'

export interface PendingLeadCard {
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
  won_at: string | null
  payment_confirmed_at: string | null
  stripe_payment_link: string | null
  stripe_payment_link_created_at: string | null
  rep_name: string | null
  rep_email: string | null
  rep_phone: string | null
}

export interface InProgressCard {
  id: string
  business_name: string
  phone_number: string | null
  email: string | null
  industry: string | null
  plan: string | null
  account_status: string
  payment_confirmed_at: string | null
  onboarding_started_at: string | null
  welcome_email_sent: boolean
  created_at: string | null
  rep_name: string | null
  rep_email: string | null
  rep_phone: string | null
}

interface Props {
  pendingLeads: PendingLeadCard[]
  pendingBusinesses: InProgressCard[]
  // Session 4A — go-live readiness percent keyed by business id. null / missing
  // means no go_live_checklist row yet ("Not started").
  readinessPercent?: Record<string, number | null>
  adminEmail: string
}

export default function OnboardingQueueClient({ pendingLeads, pendingBusinesses, readinessPercent = {}, adminEmail }: Props) {
  const [resending, setResending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resent, setResent] = useState<Set<string>>(new Set())

  async function resendWelcome(businessId: string) {
    setResending(businessId); setError(null)
    const res = await fetch(`/api/admin/businesses/${businessId}/resend-welcome`, { method: 'POST' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.ok) {
      setError(body?.error ?? 'Could not re-send welcome email.')
    } else {
      setResent(prev => {
        const next = new Set(prev)
        next.add(businessId)
        return next
      })
    }
    setResending(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 9,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#ef4444', fontSize: 13,
        }}>{error}</div>
      )}

      {/* Pending Setup */}
      {pendingLeads.length > 0 && (
        <section>
          <SectionTitle title="Pending Setup" count={pendingLeads.length} subtitle="Reps closed the deal. Promote to a business + auth account to start onboarding." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
            {pendingLeads.map(lead => {
              const hoursOld = lead.won_at
                ? Math.floor((Date.now() - new Date(lead.won_at).getTime()) / 3_600_000)
                : 0
              const timeColor = hoursOld < 12 ? '#22c55e' : hoursOld < 24 ? '#f59e0b' : '#ef4444'
              return (
                <div key={lead.id} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: 'white' }}>
                        {lead.business_name}
                      </div>
                      {lead.industry && (
                        <div style={{ fontSize: 11, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
                          {lead.industry}
                        </div>
                      )}
                    </div>
                    {lead.won_plan && <PlanBadge plan={lead.won_plan} />}
                  </div>

                  <div style={{ marginTop: 12, fontSize: 13, color: '#7BAED4', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {lead.contact_name && <div style={{ color: 'white', fontWeight: 600 }}>{lead.contact_name}</div>}
                    {lead.phone && (
                      <a href={`tel:${lead.phone}`} style={{ color: '#4A9FE8', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Phone size={12} /> {lead.phone}
                      </a>
                    )}
                    {lead.email && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Mail size={12} /> {lead.email}
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 12, fontSize: 12, color: '#4A7FBB' }}>
                    Closed by <strong style={{ color: 'white' }}>{lead.rep_name ?? '—'}</strong>
                    {lead.rep_phone && <> · <a href={`tel:${lead.rep_phone}`} style={{ color: '#4A9FE8' }}>{lead.rep_phone}</a></>}
                  </div>

                  <div style={{ marginTop: 6, fontSize: 12, color: timeColor, fontWeight: 700 }}>
                    {timeAgo(lead.won_at)} {hoursOld >= 24 && '(slow)'}
                  </div>

                  <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <PaymentStatusBadge
                      paidAt={lead.payment_confirmed_at}
                      linkSentAt={lead.stripe_payment_link_created_at}
                      hasLink={!!lead.stripe_payment_link}
                    />
                  </div>

                  <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                    <Link
                      href={`/admin/onboarding-queue/${lead.id}?type=lead`}
                      style={primaryBtn}
                    >Start Onboarding <ChevronRight size={13} /></Link>
                  </div>

                  <details style={{ marginTop: 12 }}>
                    <summary style={{ fontSize: 12, color: '#4A7FBB', cursor: 'pointer' }}>Add note</summary>
                    <div style={{ marginTop: 8 }}>
                      <ClientCommsLog leadId={lead.id} compact stage="pre_setup" adminEmail={adminEmail} />
                    </div>
                  </details>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* In Progress */}
      {pendingBusinesses.length > 0 && (
        <section>
          <SectionTitle title="In Progress" count={pendingBusinesses.length} subtitle="Business accounts created. Finish the onboarding wizard, then Go Live to activate." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
            {pendingBusinesses.map(b => (
              <div key={b.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'white' }}>{b.business_name}</div>
                    {b.industry && (
                      <div style={{ fontSize: 11, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
                        {b.industry}
                      </div>
                    )}
                  </div>
                  {b.plan && <PlanBadge plan={b.plan} />}
                </div>

                <div style={{ marginTop: 12, fontSize: 13, color: '#7BAED4' }}>
                  {b.phone_number && <div><Phone size={11} /> {b.phone_number}</div>}
                  {b.email && <div style={{ marginTop: 4 }}><Mail size={11} /> {b.email}</div>}
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: '#4A7FBB' }}>
                  Closed by <strong style={{ color: 'white' }}>{b.rep_name ?? '—'}</strong>
                </div>

                <div style={{ marginTop: 4, fontSize: 12, color: '#7BAED4' }}>
                  {timeAgo(b.created_at)} in queue
                </div>

                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <StatusPill status={b.account_status} />
                  {b.welcome_email_sent && <Pill bg="rgba(34,197,94,0.12)" color="#22c55e">Welcome sent</Pill>}
                  {/* Session 4A — go-live readiness */}
                  <ReadinessChip percent={readinessPercent[b.id] ?? null} />
                </div>

                <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link
                    href={`/admin/onboarding-queue/${b.id}?type=business`}
                    style={primaryBtn}
                  >Continue Onboarding <ChevronRight size={13} /></Link>
                  {!b.welcome_email_sent && (
                    <button
                      onClick={() => resendWelcome(b.id)}
                      disabled={resending === b.id || resent.has(b.id)}
                      style={secondaryBtn}
                    >
                      {resent.has(b.id) ? <CheckCircle2 size={13} /> : <RotateCcw size={13} />}
                      {resent.has(b.id) ? ' Sent' : resending === b.id ? ' Sending...' : ' Resend welcome'}
                    </button>
                  )}
                </div>

                <details style={{ marginTop: 12 }}>
                  <summary style={{ fontSize: 12, color: '#4A7FBB', cursor: 'pointer' }}>Add note</summary>
                  <div style={{ marginTop: 8 }}>
                    <ClientCommsLog businessId={b.id} compact stage="setup" adminEmail={adminEmail} />
                  </div>
                </details>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function SectionTitle({ title, count, subtitle }: { title: string; count: number; subtitle: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: 'white', margin: 0 }}>{title}</h2>
        <span style={{
          fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 99,
          background: 'rgba(232,98,42,0.15)', color: '#E8622A',
          border: '1px solid rgba(232,98,42,0.35)',
        }}>{count}</span>
      </div>
      <p style={{ fontSize: 13, color: '#7BAED4', margin: 0, marginTop: 4 }}>{subtitle}</p>
    </div>
  )
}

function PlanBadge({ plan }: { plan: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 9px', borderRadius: 99,
      background: 'rgba(74,159,232,0.12)', color: '#4A9FE8',
      border: '1px solid rgba(74,159,232,0.3)',
      fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
    }}>{plan}</span>
  )
}

function PaymentStatusBadge({ paidAt, linkSentAt, hasLink }: {
  paidAt: string | null
  linkSentAt: string | null
  hasLink: boolean
}) {
  if (paidAt) {
    return <Pill bg="rgba(34,197,94,0.12)" color="#22c55e">💰 Paid — ready for full onboarding</Pill>
  }
  if (hasLink || linkSentAt) {
    return <Pill bg="rgba(245,158,11,0.12)" color="#f59e0b">🟡 Payment link sent — awaiting payment</Pill>
  }
  return <Pill bg="rgba(239,68,68,0.12)" color="#ef4444">⚠️ No payment link generated</Pill>
}

function StatusPill({ status }: { status: string }) {
  const color = status === 'pending_payment' ? '#f59e0b' : '#7BAED4'
  const label = status === 'pending_payment' ? 'Awaiting payment' : 'Pending setup'
  return <Pill bg={`${color}1A`} color={color}>{label}</Pill>
}

// Session 4A — go-live checklist completion. null percent = no checklist row
// yet, shown as a muted "Readiness: Not started".
function ReadinessChip({ percent }: { percent: number | null }) {
  if (percent == null) {
    return <Pill bg="rgba(255,255,255,0.06)" color="#7BAED4">Readiness: Not started</Pill>
  }
  const color = percent >= 100 ? '#22c55e' : percent >= 60 ? '#f59e0b' : '#ef4444'
  return <Pill bg={`${color}1A`} color={color}>Readiness: {percent}%</Pill>
}

function Pill({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 9px', borderRadius: 99,
      background: bg, color, fontSize: 11, fontWeight: 700,
      border: `1px solid ${color}55`,
    }}>{children}</span>
  )
}

const cardStyle: React.CSSProperties = {
  padding: 18, borderRadius: 12,
  background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)',
  fontFamily: 'Outfit, sans-serif',
}
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '8px 12px', borderRadius: 8, border: 'none',
  background: '#E8622A', color: 'white',
  fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 700,
  cursor: 'pointer', textDecoration: 'none',
}
const secondaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '8px 12px', borderRadius: 8,
  background: 'rgba(255,255,255,0.04)', color: '#7BAED4',
  border: '1px solid rgba(255,255,255,0.12)',
  fontFamily: 'Outfit, sans-serif', fontSize: 12, fontWeight: 700,
  cursor: 'pointer',
}
