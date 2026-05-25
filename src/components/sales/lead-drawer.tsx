'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { X, Phone, Mail, Globe, MapPin, Trophy, AlertCircle, Trash2, FileText } from 'lucide-react'
import { LEAD_STATUS_STYLES, LEAD_STATUS_COLUMNS, LOST_REASONS, formatDateTime, type LeadStatus } from '@/lib/sales-format'
import type { LeadRow } from './leads-board'
import LogActivityModal from './log-activity-modal'
import WonModal from './won-modal'
import LostModal from './lost-modal'
import BadLeadModal from './bad-lead-modal'

interface Activity {
  id: string
  activity_type: string
  title: string
  body: string | null
  old_status: string | null
  new_status: string | null
  created_at: string
}

interface Props {
  lead: LeadRow
  repId: string
  onClose: () => void
  onUpdated: (lead: LeadRow) => void
  onRemoved: (id: string) => void
}

type ActiveModal = null | 'log' | 'won' | 'lost' | 'bad'

export default function LeadDrawer({ lead, onClose, onUpdated, onRemoved }: Props) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loadingActs, setLoadingActs] = useState(true)
  const [savingField, setSavingField] = useState<string | null>(null)
  const [savedTimestamp, setSavedTimestamp] = useState<string | null>(null)
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Local form state mirrors the lead — autosave on blur
  const [contactName, setContactName] = useState(lead.contact_name ?? '')
  const [phone, setPhone] = useState(lead.phone ?? '')
  const [email, setEmail] = useState(lead.email ?? '')
  const [website, setWebsite] = useState(lead.website ?? '')
  const [notes, setNotes] = useState(lead.notes ?? '')

  // Reset form fields when a different lead is opened
  useEffect(() => {
    setContactName(lead.contact_name ?? '')
    setPhone(lead.phone ?? '')
    setEmail(lead.email ?? '')
    setWebsite(lead.website ?? '')
    setNotes(lead.notes ?? '')
    setError(null)
  }, [lead.id, lead.contact_name, lead.phone, lead.email, lead.website, lead.notes])

  const loadActivities = useCallback(async () => {
    setLoadingActs(true)
    const res = await fetch(`/api/sales/leads/${lead.id}/activities`)
    if (res.ok) {
      const body = await res.json()
      setActivities(body.activities ?? [])
    }
    setLoadingActs(false)
  }, [lead.id])

  useEffect(() => { loadActivities() }, [loadActivities])

  async function saveField(field: string, value: string | null) {
    setSavingField(field); setError(null)
    const res = await fetch(`/api/sales/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value === '' ? null : value }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.error ?? 'Save failed, please try again.')
    } else {
      const body = await res.json()
      onUpdated(body.lead as LeadRow)
      setSavedTimestamp(new Date().toISOString())
    }
    setSavingField(null)
  }

  async function changeStatus(next: LeadStatus) {
    if (next === lead.status) return
    if (next === 'won') { setActiveModal('won'); return }
    if (next === 'lost') { setActiveModal('lost'); return }
    if (next === 'bad_lead') { setActiveModal('bad'); return }

    setStatusUpdating(true); setError(null)
    const res = await fetch(`/api/sales/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body?.error ?? 'Could not change status.')
    } else {
      const body = await res.json()
      onUpdated(body.lead as LeadRow)
      loadActivities()
    }
    setStatusUpdating(false)
  }

  const statusStyle = LEAD_STATUS_STYLES[lead.status]
  const isWon = lead.status === 'won'

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 90,
        }}
      />
      <aside style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 91,
        width: 'min(560px, 100vw)', background: '#0A1E38', color: 'white',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        overflowY: 'auto',
        fontFamily: 'Outfit, sans-serif',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Sticky header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 2, background: '#0A1E38',
          borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '18px 20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: '#7BAED4', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Lead
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '-0.5px', wordWrap: 'break-word' }}>
                {lead.business_name}
              </h2>
              {lead.industry && (
                <span style={{
                  display: 'inline-block', marginTop: 6,
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                  background: 'rgba(74,159,232,0.12)', color: '#4A9FE8',
                  border: '1px solid rgba(74,159,232,0.3)',
                }}>{lead.industry}</span>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 7, padding: 6, color: '#7BAED4', cursor: 'pointer',
              }}
            ><X size={16} /></button>
          </div>

          {/* Status changer */}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              display: 'inline-block', padding: '4px 10px', borderRadius: 99,
              background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}`,
              fontSize: 11, fontWeight: 700,
            }}>{statusStyle.label}</span>
            <select
              value={lead.status}
              onChange={e => changeStatus(e.target.value as LeadStatus)}
              disabled={statusUpdating || isWon}
              style={{
                padding: '8px 10px', borderRadius: 8,
                background: '#061322', border: '1px solid rgba(255,255,255,0.1)',
                color: 'white', fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none',
                cursor: isWon ? 'not-allowed' : 'pointer',
              }}
            >
              {LEAD_STATUS_COLUMNS.map(s => (
                <option key={s} value={s}>Move to: {LEAD_STATUS_STYLES[s].label}</option>
              ))}
              <option value="nurture">Move to: Nurture</option>
            </select>
            {isWon && lead.approval_status === 'pending' && (
              <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>Awaiting approval</span>
            )}
            {isWon && lead.approval_status === 'approved' && (
              <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>Approved</span>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          {error && <ErrorBanner text={error} />}

          {/* Contact section */}
          <Section title="Contact details">
            <Field label="Contact name">
              <input
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                onBlur={() => contactName !== (lead.contact_name ?? '') && saveField('contact_name', contactName)}
                style={inputStyle}
                placeholder="—"
              />
            </Field>
            <Field label="Phone" icon={<Phone size={12} />}>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onBlur={() => phone !== (lead.phone ?? '') && saveField('phone', phone)}
                style={inputStyle}
                placeholder="—"
              />
              {phone && (
                <a href={`tel:${phone}`} style={ctaLink}>Tap to call →</a>
              )}
            </Field>
            <Field label="Email" icon={<Mail size={12} />}>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                onBlur={() => email !== (lead.email ?? '') && saveField('email', email)}
                style={inputStyle}
                placeholder="—"
              />
            </Field>
            <Field label="Website" icon={<Globe size={12} />}>
              <input
                value={website}
                onChange={e => setWebsite(e.target.value)}
                onBlur={() => website !== (lead.website ?? '') && saveField('website', website)}
                style={inputStyle}
                placeholder="—"
              />
            </Field>
            {(lead.suburb || lead.state) && (
              <Field label="Location" icon={<MapPin size={12} />}>
                <div style={{ ...inputStyle, padding: '10px 12px' }}>
                  {[lead.suburb, lead.state].filter(Boolean).join(', ')}
                </div>
              </Field>
            )}
            {savingField && <div style={{ fontSize: 11, color: '#7BAED4' }}>Saving {savingField}…</div>}
            {!savingField && savedTimestamp && (
              <div style={{ fontSize: 11, color: '#22c55e' }}>Last saved {formatDateTime(savedTimestamp)}</div>
            )}
          </Section>

          {/* Notes */}
          <Section title="Notes">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={() => notes !== (lead.notes ?? '') && saveField('notes', notes)}
              placeholder="Add private notes about this lead. Autosaves when you click away."
              rows={5}
              style={{ ...inputStyle, fontFamily: 'Outfit, sans-serif', resize: 'vertical' }}
            />
          </Section>

          {/* Activity log */}
          <Section title="Activity log">
            {loadingActs ? (
              <div style={{ fontSize: 12, color: '#7BAED4' }}>Loading…</div>
            ) : activities.length === 0 ? (
              <div style={{ fontSize: 12, color: '#7BAED4', padding: 14, textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 8 }}>
                No activity yet. Log your first call, demo, or note below.
              </div>
            ) : (
              <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activities.map(a => (
                  <li key={a.id} style={{
                    padding: 12, borderRadius: 9,
                    background: '#061322', border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{a.title}</span>
                      <span style={{ fontSize: 11, color: '#7BAED4' }}>{formatDateTime(a.created_at)}</span>
                    </div>
                    {a.body && <p style={{ fontSize: 12, color: '#7BAED4', margin: '6px 0 0', lineHeight: 1.5 }}>{a.body}</p>}
                    {a.activity_type === 'status_change' && a.old_status && a.new_status && (
                      <div style={{ marginTop: 6, fontSize: 11, color: '#4A7FBB' }}>
                        {a.old_status} → {a.new_status}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        {/* Sticky bottom action bar */}
        <div style={{
          position: 'sticky', bottom: 0, background: '#0A1E38',
          borderTop: '1px solid rgba(255,255,255,0.06)', padding: 14,
          display: 'flex', gap: 8,
        }}>
          <button
            onClick={() => setActiveModal('log')}
            style={primaryBtn}
          >Log Activity</button>
          {!isWon && (
            <Link
              href={`/sales/leads/${lead.id}/proposal`}
              style={{ ...secondaryBtn, color: '#E8622A', borderColor: 'rgba(232,98,42,0.3)', textDecoration: 'none' }}
            ><FileText size={14} /> Send Proposal</Link>
          )}
          {!isWon && (
            <button
              onClick={() => setActiveModal('won')}
              style={{ ...secondaryBtn, color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' }}
            ><Trophy size={14} /> Mark Won</button>
          )}
          <button
            onClick={() => setActiveModal('bad')}
            style={{ ...secondaryBtn, color: '#94a3b8' }}
            title="Flag as bad lead"
          ><Trash2 size={14} /></button>
        </div>
      </aside>

      {activeModal === 'log' && (
        <LogActivityModal
          leadId={lead.id}
          onClose={() => setActiveModal(null)}
          onLogged={() => { setActiveModal(null); loadActivities() }}
        />
      )}
      {activeModal === 'won' && (
        <WonModal
          leadId={lead.id}
          businessName={lead.business_name}
          contactName={lead.contact_name}
          onClose={() => setActiveModal(null)}
          onSuccess={updated => { setActiveModal(null); onUpdated(updated); loadActivities() }}
        />
      )}
      {activeModal === 'lost' && (
        <LostModal
          leadId={lead.id}
          onClose={() => setActiveModal(null)}
          onSuccess={updated => { setActiveModal(null); onUpdated(updated); loadActivities() }}
        />
      )}
      {activeModal === 'bad' && (
        <BadLeadModal
          leadId={lead.id}
          businessName={lead.business_name}
          onClose={() => setActiveModal(null)}
          onSuccess={() => { setActiveModal(null); onRemoved(lead.id) }}
        />
      )}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 style={{ fontSize: 12, fontWeight: 800, color: '#E8622A', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, marginBottom: 10 }}>
        {title}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </section>
  )
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: '#7BAED4', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
        {icon} {label}
      </span>
      {children}
    </label>
  )
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start',
      padding: '10px 14px', borderRadius: 9,
      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
      color: '#ef4444', fontSize: 13,
    }}>
      <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{text}</span>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: '#061322', border: '1px solid rgba(255,255,255,0.08)',
  color: 'white', fontSize: 13, outline: 'none', fontFamily: 'Outfit, sans-serif',
}
const ctaLink: React.CSSProperties = {
  fontSize: 11, color: '#E8622A', fontWeight: 700, textDecoration: 'none', marginTop: 3,
}
const primaryBtn: React.CSSProperties = {
  flex: 1, padding: '11px 14px', borderRadius: 9,
  background: '#E8622A', color: 'white', border: 'none',
  fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}
const secondaryBtn: React.CSSProperties = {
  padding: '11px 14px', borderRadius: 9,
  background: 'rgba(255,255,255,0.04)', color: '#7BAED4',
  border: '1px solid rgba(255,255,255,0.12)',
  fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: 6,
}
