'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import ServicePricingEditor, { type ServicePricing } from '@/components/portal/service-pricing-editor'
import ServiceAreaEditor, { type ServiceArea } from '@/components/portal/service-area-editor'

type TabKey = 'business' | 'ai' | 'notifications' | 'team' | 'integrations'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', padding: 2, background: checked ? '#E8622A' : 'rgba(255,255,255,0.15)', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
      <div style={{ width: 20, height: 20, borderRadius: 10, background: 'white', position: 'absolute', top: 2, left: checked ? 22 : 2, transition: 'left 0.2s' }} />
    </button>
  )
}

const inp = { background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 10, padding: '11px 14px', width: '100%', fontFamily: 'Outfit,sans-serif', fontSize: 14, outline: 'none' } as React.CSSProperties
const ta = { ...{}, background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 10, padding: '11px 14px', width: '100%', fontFamily: 'Outfit,sans-serif', fontSize: 14, outline: 'none', resize: 'vertical' } as React.CSSProperties
const lbl = { fontSize: 12, color: '#4A7FBB', fontWeight: 600, display: 'block', marginBottom: 6 } as React.CSSProperties
const card = { background: '#071829', borderRadius: 14, padding: 16, marginBottom: 12 } as React.CSSProperties

const voices = [
  { id: 'sarah', name: 'Charlotte', desc: '🇦🇺 Warm & Conversational Australian Female' },
  { id: 'james', name: 'James', desc: '🇦🇺 Friendly & Professional Australian Male' },
  { id: 'emma', name: 'Emma', desc: '🇦🇺 Warm Australian Female, early 30s' },
  { id: 'liam', name: 'Liam', desc: '🇦🇺 Deep & Energetic Australian Male' },
]

export default function SettingsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<TabKey>('business')
  const [saved, setSaved] = useState('')
  const [biz, setBiz] = useState<Record<string, string>>({})
  const [greeting, setGreeting] = useState('')
  const [agentName, setAgentName] = useState('')
  const [voice, setVoice] = useState('sarah')
  const [faqs, setFaqs] = useState([{ q: 'What are your opening hours?', a: '' }, { q: 'How much does it cost?', a: '' }])
  const [escalation, setEscalation] = useState('Transfer if the caller asks to speak to a manager, sounds upset or angry, has a billing complaint, or requests a refund.')
  const [notifs, setNotifs] = useState({ emailOnTransfer: true, dailySummary: true, weeklyReport: true, email: '', whatsapp: false, whatsappNum: '', telegram: false, telegramUser: '', urgentCall: false, urgentNum: '' })
  const [team, setTeam] = useState<Array<{email: string; role: string}>>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')
  const [changingPw, setChangingPw] = useState(false)
  const [servicePricing, setServicePricing] = useState<ServicePricing>({})
  const [serviceArea, setServiceArea] = useState<ServiceArea>({})
  const [bizId, setBizId] = useState<string | null>(null)

  async function changePassword() {
    if (newPassword !== confirmPassword) { setPasswordMsg('Passwords do not match ❌'); return }
    if (newPassword.length < 8) { setPasswordMsg('Password must be at least 8 characters ❌'); return }
    setChangingPw(true)
    const res = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: newPassword }) })
    const data = await res.json()
    setChangingPw(false)
    if (res.ok) { setPasswordMsg('Password updated ✅'); setNewPassword(''); setConfirmPassword('') }
    else setPasswordMsg(data.error + ' ❌')
    setTimeout(() => setPasswordMsg(''), 4000)
  }
  const [syncing, setSyncing] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: b } = await supabase.from('businesses').select('*').eq('owner_user_id', user.id).single()
    if (b) {
      const biz = b as Record<string, unknown>
      setBiz(biz as Record<string, string>)
      setBizId((biz.id as string) ?? null)
      setGreeting((biz.greeting as string) || 'Thank you for calling. How can I help you today?')
      setAgentName((biz.agent_name as string) || '')
      const cfg = (biz.notifications_config ?? {}) as Record<string, unknown>
      setServicePricing((cfg.service_pricing as ServicePricing) ?? {})
      setServiceArea((cfg.service_area as ServiceArea) ?? {})
    }
    const { data: members } = await supabase.from('users').select('email, role').eq('business_id', (b as Record<string, string>)?.id)
    setTeam(members || [])
  }

  async function saveBusiness() {
    await supabase.from('businesses').update(biz).eq('id', biz.id)
    setSaved('Saved ✅'); setTimeout(() => setSaved(''), 3000)
  }

  async function syncAI() {
    setSyncing(true)
    // save agent_name and greeting to businesses table first
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: b } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).single()
      if (b) {
        await supabase.from('businesses').update({ greeting, agent_name: agentName }).eq('id', b.id)
      }
    }
    const r = await fetch('/api/vapi/sync', { method: 'POST' })
    setSyncing(false)
    setSaved(r.ok ? 'Synced to AI agent ✅' : 'Sync failed ❌')
    setTimeout(() => setSaved(''), 4000)
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
    } catch (e) {
      console.error('Voice preview failed', e)
    }
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'business', label: '🏢 Business Info' },
    { key: 'ai', label: '🤖 AI Voice Agent' },
    { key: 'notifications', label: '🔔 Notifications' },
    { key: 'team', label: '👥 Team' },
    { key: 'integrations', label: '🔗 Integrations' },
  ]

  return (
    <div style={{ padding: 32, maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white' }}>Settings</h1>
        {saved && <span style={{ fontSize: 14, color: '#22c55e' }}>{saved}</span>}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, padding: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 12, width: 'fit-content', marginBottom: 28, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'Outfit,sans-serif', background: tab === t.key ? 'white' : 'transparent', color: tab === t.key ? '#061322' : '#4A7FBB', transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Business Info */}
      {tab === 'business' && (
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 4 }}>Business Information</h3>
          <p style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 24 }}>Used by your AI agent when speaking to callers.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {[['Business Name', 'name'], ['Phone Number', 'phone_number'], ['Notification Email', 'notification_email'], ['Website', 'website'], ['Address', 'address']].map(([label, key]) => (
              <div key={key}>
                <label style={lbl}>{label}</label>
                <input value={biz[key] || ''} onChange={e => setBiz(b => ({ ...b, [key]: e.target.value }))} style={inp} />
              </div>
            ))}
            <div>
              <label style={{ ...lbl, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>ABN</span>
                {(biz.abn_verified === 'true' || (biz.abn_verified as unknown) === true) ? (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(34,197,94,0.12)', color: '#22C55E', letterSpacing: '0.05em' }}>
                    ✓ Verified
                  </span>
                ) : null}
              </label>
              <input
                value={biz.abn || ''}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 11)
                  setBiz(b => ({ ...b, abn: digits }))
                }}
                placeholder="11 digit ABN"
                inputMode="numeric"
                style={inp}
              />
              <div style={{ fontSize: 11, color: '#4A7FBB', marginTop: 4 }}>
                Your Australian Business Number. Used for invoicing.
              </div>
            </div>
          </div>
          <button onClick={saveBusiness} style={{ background: '#E8622A', color: 'white', border: 'none', padding: '12px 28px', borderRadius: 10, fontFamily: 'Outfit,sans-serif', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Save Changes</button>
        </div>
      )}

      {/* AI Voice Agent */}
      {tab === 'ai' && (
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 4 }}>AI Voice Agent</h3>
          <p style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 24 }}>Changes sync to your live AI agent instantly.</p>

          <div style={{ marginBottom: 24 }}>
            <label style={lbl}>Agent name</label>
            <input
              value={agentName}
              onChange={e => setAgentName(e.target.value)}
              placeholder="e.g. Sarah, Jake, Alex — leave blank for no name"
              style={inp}
            />
            <p style={{ fontSize: 11, color: '#4A7FBB', marginTop: 6, marginBottom: 0 }}>This is what your AI agent will call itself when answering calls.</p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={lbl}>Greeting message</label>
            <textarea value={greeting} onChange={e => setGreeting(e.target.value)} rows={3} style={ta} />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={lbl}>Voice</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {voices.map(v => (
                <div key={v.id} onClick={() => setVoice(v.id)} style={{ padding: 14, borderRadius: 12, border: `1.5px solid ${voice === v.id ? '#E8622A' : 'rgba(255,255,255,0.08)'}`, background: voice === v.id ? 'rgba(232,98,42,0.08)' : '#071829', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'white' }}>🎙️ {v.name}</div>
                    <div style={{ fontSize: 12, color: '#4A7FBB' }}>{v.desc}</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); previewVoice(v.id) }} style={{ background: voice === v.id ? '#E8622A' : 'rgba(255,255,255,0.08)', border: 'none', color: 'white', padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Outfit,sans-serif', flexShrink: 0 }}>▶ Preview</button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={lbl}>Custom FAQs</label>
            {faqs.map((faq, i) => (
              <div key={i} style={card}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input placeholder={`Question ${i + 1}`} value={faq.q} onChange={e => { const f = [...faqs]; f[i] = { ...f[i], q: e.target.value }; setFaqs(f) }} style={{ ...inp, flex: 1 }} />
                  <button onClick={() => setFaqs(f => f.filter((_, j) => j !== i))} style={{ background: 'rgba(239,68,68,0.1)', border: 'none', color: '#ef4444', padding: '0 12px', borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}>✕</button>
                </div>
                <textarea placeholder="Answer" value={faq.a} onChange={e => { const f = [...faqs]; f[i] = { ...f[i], a: e.target.value }; setFaqs(f) }} rows={2} style={ta} />
              </div>
            ))}
            <button onClick={() => setFaqs(f => [...f, { q: '', a: '' }])} style={{ width: '100%', padding: 12, background: 'transparent', border: '1px dashed rgba(74,159,232,0.3)', borderRadius: 10, color: '#4A9FE8', fontFamily: 'Outfit,sans-serif', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>+ Add FAQ</button>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={lbl}>Escalation rules</label>
            <textarea value={escalation} onChange={e => setEscalation(e.target.value)} rows={4} style={ta} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <ServicePricingEditor value={servicePricing} onChange={async (v) => {
              setServicePricing(v)
              if (!bizId) return
              const cfg = (biz as Record<string, unknown>).notifications_config as Record<string, unknown> ?? {}
              await supabase.from('businesses').update({ notifications_config: { ...cfg, service_pricing: v } }).eq('id', bizId)
            }} />
          </div>
          <div style={{ marginBottom: 28 }}>
            <ServiceAreaEditor
              value={serviceArea}
              businessAddress={biz.address ?? ''}
              onChange={async (v) => {
                setServiceArea(v)
                if (!bizId) return
                const cfg = (biz as Record<string, unknown>).notifications_config as Record<string, unknown> ?? {}
                await supabase.from('businesses').update({ notifications_config: { ...cfg, service_area: v } }).eq('id', bizId)
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={syncAI} disabled={syncing} style={{ background: '#E8622A', color: 'white', border: 'none', padding: '12px 28px', borderRadius: 10, fontFamily: 'Outfit,sans-serif', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
              {syncing ? 'Syncing…' : 'Save & Sync to AI'}
            </button>
            <button onClick={() => previewVoice(greeting || 'Hi, thank you for calling!')} style={{ background: 'transparent', border: '1px solid rgba(74,159,232,0.3)', color: '#4A9FE8', padding: '12px 20px', borderRadius: 10, fontFamily: 'Outfit,sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>🎧 Preview Voice</button>
          </div>
        </div>
      )}

      {/* Notifications */}
      {tab === 'notifications' && (
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 4 }}>Notifications</h3>
          <p style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 24 }}>Control when and how you get alerted.</p>
          <div style={{ maxWidth: 560 }}>
            <div style={card}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4A7FBB', marginBottom: 14 }}>📧 Email</div>
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Notification email</label>
                <input type="email" value={notifs.email} onChange={e => setNotifs(n => ({ ...n, email: e.target.value }))} style={inp} placeholder="you@yourbusiness.com.au" />
              </div>
              {[['emailOnTransfer', 'Email on every call transfer'], ['dailySummary', 'Daily summary email'], ['weeklyReport', 'Weekly report email']].map(([k, l]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontSize: 14, color: 'white' }}>{l}</span>
                  <Toggle checked={!!(notifs as Record<string, unknown>)[k]} onChange={v => setNotifs(n => ({ ...n, [k]: v }))} />
                </div>
              ))}
            </div>

            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: notifs.whatsapp ? 12 : 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4A7FBB' }}>💬 WhatsApp</span>
                <Toggle checked={notifs.whatsapp} onChange={v => setNotifs(n => ({ ...n, whatsapp: v }))} />
              </div>
              {notifs.whatsapp && <input type="tel" value={notifs.whatsappNum} onChange={e => setNotifs(n => ({ ...n, whatsappNum: e.target.value }))} placeholder="+61 4XX XXX XXX" style={{ ...inp, marginTop: 4 }} />}
            </div>

            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: notifs.telegram ? 12 : 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4A7FBB' }}>✈️ Telegram</span>
                <Toggle checked={notifs.telegram} onChange={v => setNotifs(n => ({ ...n, telegram: v }))} />
              </div>
              {notifs.telegram && <input value={notifs.telegramUser} onChange={e => setNotifs(n => ({ ...n, telegramUser: e.target.value }))} placeholder="@yourusername" style={{ ...inp, marginTop: 4 }} />}
            </div>

            <div style={{ ...card, border: '1px solid rgba(232,98,42,0.25)', background: 'rgba(232,98,42,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: notifs.urgentCall ? 12 : 0 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#E8622A' }}>📞 Urgent Call-Through</div>
                  <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 3 }}>Call your mobile when something urgent happens</div>
                </div>
                <Toggle checked={notifs.urgentCall} onChange={v => setNotifs(n => ({ ...n, urgentCall: v }))} />
              </div>
              {notifs.urgentCall && <input type="tel" value={notifs.urgentNum} onChange={e => setNotifs(n => ({ ...n, urgentNum: e.target.value }))} placeholder="+61 4XX XXX XXX" style={{ ...inp, marginTop: 4 }} />}
            </div>

            <button onClick={saveBusiness} style={{ background: '#E8622A', color: 'white', border: 'none', padding: '12px 28px', borderRadius: 10, fontFamily: 'Outfit,sans-serif', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Save Preferences</button>
          </div>
        </div>
      )}

      {/* Team */}
      {tab === 'team' && (
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 4 }}>Team Access</h3>
          <p style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 24 }}>Invite team members to access your portal.</p>
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, maxWidth: 480 }}>
            <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="colleague@yourbusiness.com.au" style={{ ...inp, flex: 1 }} />
            <button onClick={() => { setSaved('Invite sent ✅'); setInviteEmail(''); setTimeout(() => setSaved(''), 3000) }}
              style={{ background: '#E8622A', color: 'white', border: 'none', padding: '0 20px', borderRadius: 10, fontFamily: 'Outfit,sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer', flexShrink: 0 }}>Send Invite</button>
          </div>
          <div style={{ maxWidth: 560 }}>
            {team.map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px', background: '#071829', borderRadius: 12, marginBottom: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#E8622A,#4A9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white' }}>{m.email[0].toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>{m.email}</div>
                  <div style={{ fontSize: 12, color: '#4A7FBB', textTransform: 'capitalize' }}>{m.role}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: 'rgba(232,98,42,0.12)', color: '#E8622A' }}>{m.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Change Password — shown in Team tab */}
      {tab === 'team' && (
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 28, marginTop: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 4 }}>Change Password</h3>
          <p style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 20 }}>Update your portal login password.</p>
          {passwordMsg && <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: passwordMsg.includes('✅') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: passwordMsg.includes('✅') ? '#22c55e' : '#ef4444', fontSize: 13 }}>{passwordMsg}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 560, marginBottom: 16 }}>
            <div>
              <label style={lbl}>New Password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 8 characters" style={inp} />
            </div>
            <div>
              <label style={lbl}>Confirm Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat password" style={inp} />
            </div>
          </div>
          <button onClick={changePassword} disabled={changingPw || !newPassword}
            style={{ background: '#E8622A', color: 'white', border: 'none', padding: '12px 28px', borderRadius: 10, fontFamily: 'Outfit,sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: !newPassword ? 0.5 : 1 }}>
            {changingPw ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      )}

      {/* Integrations */}
      {tab === 'integrations' && (
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 4 }}>Integrations</h3>
          <p style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 24 }}>Connect your booking system and other tools to your AI agent.</p>
          <div style={{ maxWidth: 560 }}>
            {[
              { label: 'Booking Page URL', key: 'booking_url', placeholder: 'https://calendly.com/yourbusiness' },
            ].map(({ label, key, placeholder }) => (
              <div key={key} style={{ marginBottom: 16 }}>
                <label style={lbl}>{label}</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input value={biz[key] || ''} onChange={e => setBiz(b => ({ ...b, [key]: e.target.value }))} placeholder={placeholder} style={{ ...inp, flex: 1 }} />
                  <button onClick={saveBusiness} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#4A7FBB', padding: '0 16px', borderRadius: 10, fontFamily: 'Outfit,sans-serif', cursor: 'pointer', flexShrink: 0 }}>Save</button>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 8 }}>
              <label style={lbl}>Your Talkmate API Key</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <input value={biz.api_key ? 'tm_live_' + biz.api_key.substring(0,8) + '••••••••' : 'tm_live_••••••••••••'} readOnly style={{ ...inp, flex: 1, fontFamily: 'monospace', fontSize: 12, opacity: 0.7 }} />
                <button onClick={() => navigator.clipboard.writeText(biz.api_key || '')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#4A7FBB', padding: '0 16px', borderRadius: 10, fontFamily: 'Outfit,sans-serif', cursor: 'pointer', flexShrink: 0 }}>Copy</button>
              </div>
              <p style={{ fontSize: 12, color: '#4A7FBB', marginTop: 6 }}>Use this key if you need to connect Talkmate to third-party tools via our API.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
