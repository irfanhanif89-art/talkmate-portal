'use client'

import { useState } from 'react'

interface Config {
  after_hours_enabled?: boolean
  after_hours_action?: string
  missed_transfer_action?: string
  wait_time_minutes?: number
  emergency_keywords?: string[]
  emergency_action?: string
  sms_followup_enabled?: boolean
  sms_followup_template?: string
  repeat_caller_threshold?: number
  repeat_caller_notify?: boolean
}

const DEFAULT_SMS = 'Hi {name}, thanks for calling {business_name}. {summary} Call us back on {phone} if you need anything else.'

const isMedical = (i: string) => ['healthcare', 'medical', 'dental', 'physio', 'medispa'].includes(i)

export default function RoutingView({
  plan, industry, defaultEmergencyKeywords, initialConfig, initialKnowledgeBase,
}: {
  plan: string
  industry: string
  defaultEmergencyKeywords: string[]
  initialConfig: Record<string, unknown>
  initialKnowledgeBase: string
}) {
  const cfg = initialConfig as Config
  const [afterHoursEnabled, setAfterHoursEnabled] = useState(!!cfg.after_hours_enabled)
  const [afterHoursAction, setAfterHoursAction] = useState(cfg.after_hours_action ?? 'take_message')
  const [missedTransferAction, setMissedTransferAction] = useState(cfg.missed_transfer_action ?? 'take_message')
  const [waitTime, setWaitTime] = useState<number>(typeof cfg.wait_time_minutes === 'number' ? cfg.wait_time_minutes : 0)
  const [emergencyKeywords, setEmergencyKeywords] = useState(
    (cfg.emergency_keywords ?? defaultEmergencyKeywords).join('\n'),
  )
  const [emergencyAction, setEmergencyAction] = useState(
    cfg.emergency_action ?? (isMedical(industry) ? 'call_000' : 'transfer_escalation'),
  )
  const [smsFollowupEnabled, setSmsFollowupEnabled] = useState(!!cfg.sms_followup_enabled)
  const [smsTemplate, setSmsTemplate] = useState(cfg.sms_followup_template ?? DEFAULT_SMS)
  const [repeatNotify, setRepeatNotify] = useState(cfg.repeat_caller_notify !== false)
  const [repeatThreshold, setRepeatThreshold] = useState<number>(
    typeof cfg.repeat_caller_threshold === 'number' ? cfg.repeat_caller_threshold : 3,
  )
  const [knowledgeBase, setKnowledgeBase] = useState(initialKnowledgeBase)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  async function save() {
    setSaving(true); setError(null)
    try {
      const keywords = emergencyKeywords.split('\n').map(s => s.trim()).filter(Boolean)
      const res = await fetch('/api/portal/settings/escalation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escalation_config: {
            after_hours_enabled: afterHoursEnabled,
            after_hours_action: afterHoursAction,
            missed_transfer_action: missedTransferAction,
            wait_time_minutes: Math.max(0, waitTime || 0),
            emergency_keywords: keywords,
            emergency_action: emergencyAction,
            sms_followup_enabled: smsFollowupEnabled,
            sms_followup_template: smsTemplate,
            repeat_caller_threshold: Math.max(1, repeatThreshold || 1),
            repeat_caller_notify: repeatNotify,
          },
          knowledge_base: knowledgeBase,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setSavedAt(new Date().toLocaleTimeString('en-AU'))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>Call Routing</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: '4px 0 0 0' }}>
          How your agent handles after-hours, missed transfers, emergencies, and repeat callers.
        </p>
      </div>

      {/* After-hours */}
      <Section title="After-hours calls">
        <ToggleRow
          label="Enable after-hours routing"
          checked={afterHoursEnabled}
          onChange={setAfterHoursEnabled}
        />
        {afterHoursEnabled && (
          <Field label="When a call comes in after hours:">
            <Select value={afterHoursAction} onChange={setAfterHoursAction} options={[
              { value: 'take_message', label: 'Take a message' },
              { value: 'transfer_to_escalation', label: 'Transfer to escalation contact anyway' },
              { value: 'voicemail', label: 'Tell caller we\'re closed and take a message' },
            ]} />
          </Field>
        )}
      </Section>

      {/* Missed transfers */}
      <Section title="Missed transfers">
        <Field label="If a transfer attempt is not answered:">
          <Select value={missedTransferAction} onChange={setMissedTransferAction} options={[
            { value: 'take_message', label: 'Take a message from the caller' },
            { value: 'try_next_member', label: 'Try the next available team member' },
            { value: 'callback', label: 'Offer to schedule a callback' },
          ]} />
        </Field>
      </Section>

      {/* Emergency */}
      <Section title="Emergency keywords">
        <Field label="Add keywords that trigger emergency routing (one per line):">
          <TextArea value={emergencyKeywords} onChange={setEmergencyKeywords} rows={5} />
        </Field>
        <Field label="When an emergency keyword is detected:">
          <Select value={emergencyAction} onChange={setEmergencyAction} options={
            isMedical(industry)
              ? [
                  { value: 'call_000', label: 'Tell caller to call 000 or go to emergency' },
                  { value: 'transfer_escalation', label: 'Transfer to escalation contact immediately' },
                  { value: 'take_message', label: 'Take a message with urgent flag' },
                ]
              : [
                  { value: 'transfer_escalation', label: 'Transfer to escalation contact immediately' },
                  { value: 'take_message', label: 'Take a message with urgent flag' },
                ]
          } />
        </Field>
      </Section>

      {/* Wait time */}
      <Section title="Wait time">
        <Field label="Current wait time (minutes):">
          <input
            type="number" min={0}
            value={waitTime}
            onChange={e => setWaitTime(Number(e.target.value))}
            style={{ ...inputStyle, maxWidth: 140 }}
          />
        </Field>
        <p style={{ fontSize: 12, color: '#7BAED4', margin: 0 }}>
          This is what your agent tells callers when asked how long the wait is. Update manually when your team is busy.
        </p>
      </Section>

      {/* SMS follow-up */}
      <Section title="SMS follow-up">
        <ToggleRow
          label="Send SMS to caller after every call"
          checked={smsFollowupEnabled}
          onChange={setSmsFollowupEnabled}
        />
        {smsFollowupEnabled && (
          <>
            <Field label="SMS template:">
              <TextArea value={smsTemplate} onChange={setSmsTemplate} rows={3} />
            </Field>
            <p style={{ fontSize: 12, color: '#7BAED4', margin: 0 }}>
              Available variables: <code>{'{name}'}</code>, <code>{'{business_name}'}</code>, <code>{'{summary}'}</code>, <code>{'{phone}'}</code>.
            </p>
          </>
        )}
      </Section>

      {/* Repeat caller */}
      <Section title="Repeat caller alerts">
        <ToggleRow
          label="Notify me when a caller rings multiple times"
          checked={repeatNotify}
          onChange={setRepeatNotify}
        />
        {repeatNotify && (
          <Field label="Threshold (times in 7 days):">
            <input
              type="number" min={1}
              value={repeatThreshold}
              onChange={e => setRepeatThreshold(Number(e.target.value))}
              style={{ ...inputStyle, maxWidth: 140 }}
            />
          </Field>
        )}
        <p style={{ fontSize: 12, color: '#7BAED4', margin: 0 }}>
          Repeat callers are flagged in your contacts list.
        </p>
      </Section>

      {/* Knowledge base */}
      <Section title="Knowledge base / FAQs">
        <Field label="Common questions and answers your agent should know:">
          <TextArea
            value={knowledgeBase}
            onChange={setKnowledgeBase}
            rows={10}
            placeholder={'Do you have parking? Yes, free parking at rear entrance.\nDo you bulk bill? No, we are a private billing practice.\nWhat are your payment terms? Payment required on completion.'}
          />
        </Field>
        <p style={{ fontSize: 12, color: '#7BAED4', margin: 0 }}>
          Your agent reads this before escalating a call. Add answers to common questions your team gets asked.
        </p>
      </Section>

      {plan === 'starter' && (
        <div style={{
          padding: 14, borderRadius: 10, marginBottom: 18,
          background: 'rgba(232,98,42,0.08)', border: '1px solid rgba(232,98,42,0.30)',
          color: '#E8622A', fontSize: 12, fontWeight: 600,
        }}>
          You're on the Starter plan — live call transfer is disabled. After-hours and emergency routing still work; the agent will take a message instead of attempting transfers.
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: '#FCA5A5', fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <span style={{ fontSize: 12, color: '#22C55E' }}>{savedAt ? `Saved ${savedAt}` : ''}</span>
        <button onClick={save} disabled={saving} style={{
          padding: '11px 22px', borderRadius: 10, fontSize: 14, fontWeight: 700,
          background: '#E8622A', border: 'none', color: 'white',
          cursor: saving ? 'wait' : 'pointer', fontFamily: 'Outfit, sans-serif',
        }}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  )
}

// ---- atoms ----

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{
      background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12, padding: 20, marginBottom: 14,
    }}>
      <h2 style={{ fontSize: 14, fontWeight: 800, color: 'white', margin: 0, marginBottom: 14, letterSpacing: '-0.3px' }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>{children}</div>
    </section>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: 12, borderRadius: 9,
      background: '#071829', border: '1px solid rgba(255,255,255,0.06)',
      cursor: 'pointer',
    }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#E8622A' }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{label}</span>
    </label>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>{label}</span>
      {children}
    </div>
  )
}

function Select({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
      {options.map(o => <option key={o.value} value={o.value} style={{ background: '#0A1E38' }}>{o.label}</option>)}
    </select>
  )
}

function TextArea({ value, onChange, rows, placeholder }: {
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={rows ?? 4}
      placeholder={placeholder}
      style={{ ...inputStyle, resize: 'vertical' as const, fontFamily: 'Outfit, sans-serif' }}
    />
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 9,
  background: '#071829', border: '1px solid rgba(255,255,255,0.10)',
  color: 'white', fontSize: 13, outline: 'none',
  fontFamily: 'Outfit, sans-serif',
}
