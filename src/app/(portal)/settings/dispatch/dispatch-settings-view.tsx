'use client'

import { useState } from 'react'

interface Config {
  job_types?: string[]
  default_wait_minutes?: number
  auto_wait_calculation?: boolean
  max_concurrent_jobs?: number
  after_hours_dispatch?: boolean
  overbooking_action?: 'queue' | 'decline' | 'waitlist'
}

const ALL_JOB_TYPES = [
  { value: 'car_tow', label: 'Standard car tow' },
  { value: '4wd_tow', label: '4WD / SUV tow' },
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'van', label: 'Van / light commercial' },
  { value: 'heavy_vehicle', label: 'Heavy vehicle' },
  { value: 'container', label: 'Container' },
  { value: 'machinery', label: 'Machinery / plant' },
]

export default function DispatchSettingsView({
  industry, plan, dispatchEnabled, initialConfig,
}: {
  industry: string
  plan: string
  dispatchEnabled: boolean
  initialConfig: Record<string, unknown>
}) {
  const cfg = initialConfig as Config
  const [jobTypes, setJobTypes] = useState<string[]>(cfg.job_types ?? ALL_JOB_TYPES.map(t => t.value))
  const [overbookingAction, setOverbookingAction] = useState<Config['overbooking_action']>(cfg.overbooking_action ?? 'queue')
  const [autoWait, setAutoWait] = useState(cfg.auto_wait_calculation !== false)
  const [waitMinutes, setWaitMinutes] = useState<number>(cfg.default_wait_minutes ?? 45)
  const [afterHoursDispatch, setAfterHoursDispatch] = useState(cfg.after_hours_dispatch !== false)
  const [maxConcurrent, setMaxConcurrent] = useState<number>(cfg.max_concurrent_jobs ?? 5)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  function toggleType(t: string) {
    setJobTypes(list => list.includes(t) ? list.filter(x => x !== t) : [...list, t])
  }

  async function save() {
    setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/portal/dispatch/config', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dispatch_config: {
            job_types: jobTypes,
            overbooking_action: overbookingAction,
            auto_wait_calculation: autoWait,
            default_wait_minutes: Math.max(0, waitMinutes || 0),
            after_hours_dispatch: afterHoursDispatch,
            max_concurrent_jobs: Math.max(1, maxConcurrent || 1),
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setSavedAt(new Date().toLocaleTimeString('en-AU'))
    } catch (e) {
      setErr((e as Error).message)
    } finally { setSaving(false) }
  }

  if (industry !== 'towing' || plan === 'starter' || !dispatchEnabled) {
    return (
      <div style={{ padding: 24, borderRadius: 12, background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', color: '#7BAED4', fontSize: 14 }}>
        Dispatch settings appear once your account has dispatch enabled. <a href="/settings" style={{ color: '#4A9FE8' }}>Back to settings</a>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', margin: 0 }}>Dispatch Settings</h1>
        <p style={{ fontSize: 13, color: '#7BAED4', margin: '4px 0 0 0' }}>
          Tune the dispatcher to match how your operation actually runs.
        </p>
      </div>

      <Section title="Job types">
        <p style={subText}>What jobs do you accept? Deselect anything you don't handle and the agent won't accept those jobs.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 6, marginTop: 8 }}>
          {ALL_JOB_TYPES.map(t => {
            const checked = jobTypes.includes(t.value)
            return (
              <label key={t.value} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 8, background: checked ? 'rgba(232,98,42,0.10)' : '#071829', border: `1px solid ${checked ? 'rgba(232,98,42,0.40)' : 'rgba(255,255,255,0.05)'}`, cursor: 'pointer', fontSize: 12, color: 'white' }}>
                <input type="checkbox" checked={checked} onChange={() => toggleType(t.value)} />
                <span>{t.label}</span>
              </label>
            )
          })}
        </div>
      </Section>

      <Section title="Overbooking">
        <Field label="When all drivers are busy:">
          <select value={overbookingAction} onChange={e => setOverbookingAction(e.target.value as Config['overbooking_action'])} style={inputStyle}>
            <option value="queue" style={{ background: '#0A1E38' }}>Accept and queue (agent tells caller there's a wait)</option>
            <option value="decline" style={{ background: '#0A1E38' }}>Decline (agent says we can't take it right now)</option>
            <option value="waitlist" style={{ background: '#0A1E38' }}>Waitlist (agent takes details and promises a callback)</option>
          </select>
        </Field>
      </Section>

      <Section title="Wait time">
        <ToggleRow label="Calculate wait time automatically from active jobs" checked={autoWait} onChange={setAutoWait} />
        <Field label="Estimated minutes per job">
          <input type="number" min={1} value={waitMinutes} onChange={e => setWaitMinutes(Number(e.target.value))} style={{ ...inputStyle, maxWidth: 140 }} />
        </Field>
        <p style={subText}>Auto formula: (active jobs / available drivers) × minutes per job.</p>
      </Section>

      <Section title="After-hours dispatch">
        <ToggleRow label="Accept dispatch jobs after hours" checked={afterHoursDispatch} onChange={setAfterHoursDispatch} />
        <p style={subText}>After-hours jobs are logged as pending for morning dispatch.</p>
      </Section>

      <Section title="Concurrency limit">
        <Field label="Maximum concurrent jobs">
          <input type="number" min={1} value={maxConcurrent} onChange={e => setMaxConcurrent(Number(e.target.value))} style={{ ...inputStyle, maxWidth: 140 }} />
        </Field>
        <p style={subText}>Cap on simultaneous active jobs across the fleet. Set high enough to absorb burst volume.</p>
      </Section>

      {err && <div style={errBoxStyle}>{err}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
        <span style={{ fontSize: 12, color: '#22C55E' }}>{savedAt ? `Saved ${savedAt}` : ''}</span>
        <button onClick={save} disabled={saving} style={primaryBtn}>{saving ? 'Saving…' : 'Save settings'}</button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, marginBottom: 14 }}>
      <h2 style={{ fontSize: 14, fontWeight: 800, color: 'white', margin: 0, marginBottom: 12, letterSpacing: '-0.3px' }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>{children}</div>
    </section>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 5 }}>{label}</span>
      {children}
    </div>
  )
}
function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 9, background: '#071829', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#E8622A' }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{label}</span>
    </label>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 9, background: '#071829', border: '1px solid rgba(255,255,255,0.10)', color: 'white', fontSize: 13, fontFamily: 'Outfit, sans-serif', outline: 'none' }
const primaryBtn: React.CSSProperties = { padding: '11px 22px', borderRadius: 10, fontSize: 14, fontWeight: 700, background: '#E8622A', border: 'none', color: 'white', cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }
const subText: React.CSSProperties = { fontSize: 12, color: '#7BAED4', margin: 0 }
const errBoxStyle: React.CSSProperties = { padding: '10px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: '#FCA5A5', fontSize: 13, marginBottom: 14 }
