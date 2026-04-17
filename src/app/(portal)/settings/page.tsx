'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessType } from '@/context/business-type-context'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Plus, Trash2, Save } from 'lucide-react'

export default function SettingsPage() {
  const { config, businessId, businessType } = useBusinessType()
  const supabase = createClient()
  const [business, setBusiness] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')
  const [faqs, setFaqs] = useState<Array<{question: string; answer: string}>>([])
  const [escalations, setEscalations] = useState<Array<{trigger: string; action: string}>>([{ trigger: config.escalationTemplate, action: 'Transfer' }])
  const [notif, setNotif] = useState<Record<string, boolean | string>>({})
  const [teamMembers, setTeamMembers] = useState<Array<{id: string; email: string; role: string}>>([])
  const [inviteEmail, setInviteEmail] = useState('')

  useEffect(() => { loadData() }, [businessId])

  async function loadData() {
    const { data: biz } = await supabase.from('businesses').select('*').eq('id', businessId).single()
    if (biz) { setBusiness(biz); setNotif((biz.notifications_config as Record<string, boolean | string>) || {}) }
    const { data: team } = await supabase.from('users').select('id, email, role').eq('business_id', businessId)
    setTeamMembers(team || [])
  }

  async function saveBusiness() {
    setSaving(true)
    await supabase.from('businesses').update(business).eq('id', businessId)
    setSaving(false); setSaved('Business info saved ✅'); setTimeout(() => setSaved(''), 3000)
  }

  async function saveNotifications() {
    setSaving(true)
    await supabase.from('businesses').update({ notifications_config: notif }).eq('id', businessId)
    setSaving(false); setSaved('Notifications saved ✅'); setTimeout(() => setSaved(''), 3000)
  }

  async function syncAI() {
    setSaving(true)
    const res = await fetch('/api/vapi/sync', { method: 'POST' })
    setSaving(false)
    setSaved(res.ok ? 'Synced to AI agent ✅' : 'Sync failed ❌'); setTimeout(() => setSaved(''), 4000)
  }

  async function inviteTeamMember() {
    if (!inviteEmail) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await fetch('/api/team/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: inviteEmail, businessId, inviterEmail: user.email }) })
    setInviteEmail('')
    setSaved('Invite sent ✅'); setTimeout(() => setSaved(''), 3000)
  }

  async function removeTeamMember(id: string) {
    if (!confirm('Remove this team member?')) return
    await supabase.from('users').delete().eq('id', id)
    setTeamMembers(prev => prev.filter(m => m.id !== id))
  }

  const inputStyle = { background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }
  const labelStyle = { color: '#4A7FBB' }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        {saved && <span className="text-sm" style={{ color: '#22c55e' }}>{saved}</span>}
      </div>

      <Tabs defaultValue="business" className="space-y-6">
        <TabsList style={{ background: 'rgba(255,255,255,0.05)' }}>
          {['business', 'ai', 'notifications', 'integrations', 'team'].map(t => (
            <TabsTrigger key={t} value={t} className="capitalize">{t === 'ai' ? 'AI Voice' : t}</TabsTrigger>
          ))}
        </TabsList>

        {/* Tab 1: Business Info */}
        <TabsContent value="business" className="p-6 rounded-2xl border space-y-4" style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.06)' }}>
          <h2 className="font-semibold text-white">Business Information</h2>
          {[['name', 'Business Name'], ['phone_number', 'Phone Number'], ['address', 'Address'], ['website', 'Website'], ['abn', 'ABN']].map(([key, label]) => (
            <div key={key}>
              <Label className="text-xs mb-1.5 block" style={labelStyle}>{label}</Label>
              <Input value={(business[key] as string) || ''} onChange={e => setBusiness(b => ({ ...b, [key]: e.target.value }))} style={inputStyle} />
            </div>
          ))}
          <Button onClick={saveBusiness} disabled={saving} className="gap-2" style={{ background: '#E8622A', color: 'white', border: 'none' }}>
            <Save size={14} />{saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </TabsContent>

        {/* Tab 2: AI Voice */}
        <TabsContent value="ai" className="p-6 rounded-2xl border space-y-6" style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="font-semibold text-white mb-4">AI Voice Settings</h2>
            <Label className="text-xs mb-1.5 block" style={labelStyle}>Greeting message (500 char max)</Label>
            <Textarea value={(business.greeting as string) || ''} onChange={e => setBusiness(b => ({ ...b, greeting: e.target.value.slice(0, 500) }))} rows={3} style={inputStyle} />
            <p className="text-xs mt-1 text-right" style={{ color: '#4A7FBB' }}>{((business.greeting as string) || '').length}/500</p>
          </div>

          <div>
            <Label className="text-xs mb-2 block font-semibold" style={labelStyle}>Custom FAQs</Label>
            {faqs.map((faq, i) => (
              <div key={i} className="mb-3 p-3 rounded-lg space-y-2" style={{ background: '#071829' }}>
                <Input placeholder="Question" value={faq.question} onChange={e => { const f = [...faqs]; f[i].question = e.target.value; setFaqs(f) }} style={inputStyle} />
                <Textarea placeholder="Answer" value={faq.answer} onChange={e => { const f = [...faqs]; f[i].answer = e.target.value; setFaqs(f) }} rows={2} style={inputStyle} />
                <button onClick={() => setFaqs(f => f.filter((_, j) => j !== i))} style={{ color: '#ef4444', fontSize: 12 }}>Remove</button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setFaqs(f => [...f, { question: '', answer: '' }])} className="gap-2 mt-2"
              style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#4A7FBB' }}><Plus size={13} /> Add FAQ</Button>
          </div>

          <div>
            <Label className="text-xs mb-2 block font-semibold" style={labelStyle}>Escalation Rules</Label>
            {escalations.map((rule, i) => (
              <div key={i} className="flex gap-3 mb-2 items-center">
                <Input placeholder="If caller says…" value={rule.trigger} onChange={e => { const r = [...escalations]; r[i].trigger = e.target.value; setEscalations(r) }} style={{ ...inputStyle, flex: 2 }} />
                <span style={{ color: '#4A7FBB' }}>→</span>
                <Input placeholder="Action" value={rule.action} onChange={e => { const r = [...escalations]; r[i].action = e.target.value; setEscalations(r) }} style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => setEscalations(r => r.filter((_, j) => j !== i))} style={{ color: '#ef4444' }}><Trash2 size={14} /></button>
              </div>
            ))}
            {config.complianceRule && (
              <div className="p-3 rounded-lg mt-2 border" style={{ background: 'rgba(232,98,42,0.06)', borderColor: 'rgba(232,98,42,0.25)' }}>
                <p className="text-xs font-semibold mb-1" style={{ color: '#E8622A' }}>🔒 Locked compliance rule</p>
                <p className="text-xs" style={{ color: '#7BAED4' }}>{config.complianceRule}</p>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => setEscalations(r => [...r, { trigger: '', action: 'Transfer' }])} className="gap-2 mt-2"
              style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#4A7FBB' }}><Plus size={13} /> Add Rule</Button>
          </div>

          <Button onClick={syncAI} disabled={saving} style={{ background: '#E8622A', color: 'white', border: 'none' }} className="gap-2">
            <Save size={14} />{saving ? 'Syncing…' : 'Save & Sync to AI'}
          </Button>
        </TabsContent>

        {/* Tab 3: Notifications */}
        <TabsContent value="notifications" className="p-6 rounded-2xl border space-y-4" style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.06)' }}>
          <h2 className="font-semibold text-white">Notification Preferences</h2>
          {[['emailOnTransfer', 'Email on call transfer'], ['dailySummary', 'Daily summary email'], ['weeklyReport', 'Weekly report'], ['smsOnTransfer', 'SMS on transfer'], ['limitAlert', 'Alert at 80% call limit']].map(([key, label]) => (
            <div key={key} className="flex items-center justify-between p-4 rounded-xl" style={{ background: '#071829' }}>
              <span className="text-sm text-white">{label}</span>
              <Switch checked={!!notif[key]} onCheckedChange={v => setNotif(n => ({ ...n, [key]: v }))} />
            </div>
          ))}
          <div>
            <Label className="text-xs mb-1.5 block" style={labelStyle}>Notification email</Label>
            <Input type="email" value={(notif.email as string) || ''} onChange={e => setNotif(n => ({ ...n, email: e.target.value }))} style={inputStyle} />
          </div>
          <Button onClick={saveNotifications} disabled={saving} style={{ background: '#E8622A', color: 'white', border: 'none' }}>Save</Button>
        </TabsContent>

        {/* Tab 4: Integrations */}
        <TabsContent value="integrations" className="p-6 rounded-2xl border space-y-6" style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.06)' }}>
          <h2 className="font-semibold text-white">Integrations</h2>
          <div className="space-y-4">
            {[
              { label: 'Vapi Agent ID', key: 'vapi_agent_id', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
              { label: 'Make.com Webhook URL', key: 'make_webhook_url', placeholder: 'https://hook.eu1.make.com/...' },
              ...(config.hasAppointments ? [{ label: 'Booking Page URL (AI sends to callers)', key: 'booking_url', placeholder: 'https://calendly.com/yourbusiness' }] : []),
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <Label className="text-xs mb-1.5 block" style={labelStyle}>{label}</Label>
                <div className="flex gap-2">
                  <Input value={(business[key] as string) || ''} onChange={e => setBusiness(b => ({ ...b, [key]: e.target.value }))} placeholder={placeholder} style={inputStyle} className="flex-1" />
                  <Button onClick={saveBusiness} variant="outline" size="sm" style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#4A7FBB' }}>Save</Button>
                </div>
              </div>
            ))}
            <div>
              <Label className="text-xs mb-1.5 block" style={labelStyle}>Your API Key</Label>
              <div className="flex gap-2">
                <Input value={(business.api_key as string) || '—'} readOnly style={{ ...inputStyle, opacity: 0.7 }} className="flex-1 font-mono text-xs" />
                <Button onClick={() => navigator.clipboard.writeText((business.api_key as string) || '')} variant="outline" size="sm" style={{ borderColor: 'rgba(255,255,255,0.1)', color: '#4A7FBB' }}>Copy</Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 5: Team */}
        <TabsContent value="team" className="p-6 rounded-2xl border" style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.06)' }}>
          <h2 className="font-semibold text-white mb-4">Team Access</h2>
          <div className="mb-6">
            <div className="flex gap-3">
              <Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="colleague@business.com.au"
                style={inputStyle} className="flex-1" />
              <Button onClick={inviteTeamMember} style={{ background: '#E8622A', color: 'white', border: 'none' }}>Invite</Button>
            </div>
          </div>
          <div className="space-y-2">
            {teamMembers.map(m => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: '#071829' }}>
                <div>
                  <p className="text-sm font-medium text-white">{m.email}</p>
                  <p className="text-xs capitalize" style={{ color: '#4A7FBB' }}>{m.role}</p>
                </div>
                <button onClick={() => removeTeamMember(m.id)} style={{ color: '#ef4444' }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
