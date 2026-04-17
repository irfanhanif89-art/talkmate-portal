'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessType } from '@/context/business-type-context'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, User, Phone, Clock } from 'lucide-react'

interface Appointment {
  id: string; customer_name: string; customer_phone: string; service_type: string
  scheduled_at: string; status: string; notes: string; is_new_customer: boolean
  urgency?: string; created_at: string
}

interface Job {
  id: string; customer_name: string; customer_phone: string; job_type: string
  address: string; urgency: string; status: string; notes: string; created_at: string
}

const APPT_STATUSES = ['enquired', 'confirmed', 'completed', 'cancelled']
const JOB_STATUSES = ['new', 'assigned', 'in_progress', 'completed', 'cancelled']
const statusLabel = (s: string) => s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())

const urgencyColor = (u: string) => {
  if (u === 'emergency') return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' }
  if (u === 'scheduled') return { bg: 'rgba(74,159,232,0.15)', color: '#4A9FE8' }
  return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' }
}

export default function AppointmentsPage() {
  const { config, businessId, businessType } = useBusinessType()
  const supabase = createClient()
  const isJobs = config.hasJobDispatch
  const table = isJobs ? 'jobs' : 'appointments'
  const statuses = isJobs ? JOB_STATUSES : APPT_STATUSES

  const [items, setItems] = useState<(Appointment | Job)[]>([])
  const [selected, setSelected] = useState<Appointment | Job | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<'kanban' | 'list'>('kanban')

  useEffect(() => { fetchItems() }, [businessId])

  async function fetchItems() {
    const { data } = await supabase.from(table).select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setItems(data ?? [])
  }

  function openItem(item: Appointment | Job) {
    setSelected(item); setEditNotes(item.notes || ''); setEditStatus(item.status)
  }

  async function saveItem() {
    if (!selected) return
    setSaving(true)
    await supabase.from(table).update({ notes: editNotes, status: editStatus }).eq('id', selected.id)
    setItems(prev => prev.map(i => i.id === selected.id ? { ...i, notes: editNotes, status: editStatus } : i))
    setSaving(false); setSelected(null)
  }

  async function sendSmsReminder() {
    if (!selected) return
    await fetch('/api/sms/reminder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: selected.id, table }) })
    alert('SMS reminder sent!')
  }

  const grouped = statuses.reduce((acc, s) => {
    acc[s] = items.filter(i => i.status === s)
    return acc
  }, {} as Record<string, typeof items>)

  const statusCardColor = (s: string) => {
    if (['completed'].includes(s)) return 'rgba(34,197,94,0.08)'
    if (['cancelled'].includes(s)) return 'rgba(239,68,68,0.08)'
    if (['confirmed', 'assigned', 'in_progress'].includes(s)) return 'rgba(74,159,232,0.08)'
    return 'rgba(255,255,255,0.03)'
  }

  if (!config.hasAppointments && !config.hasJobDispatch) {
    return <div className="p-12 text-center" style={{ color: '#4A7FBB' }}>Appointments & jobs are not enabled for your business type.</div>
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{isJobs ? 'Jobs' : 'Appointments'}</h1>
          <p className="text-sm mt-1" style={{ color: '#4A7FBB' }}>{items.length} total</p>
        </div>
        <div className="flex gap-2">
          {(['kanban', 'list'] as const).map(v => (
            <Button key={v} variant="outline" size="sm" onClick={() => setView(v)}
              style={{ borderColor: view === v ? '#E8622A' : 'rgba(255,255,255,0.1)', color: view === v ? '#E8622A' : '#4A7FBB', background: 'transparent' }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {view === 'kanban' ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {statuses.map(status => (
            <div key={status} className="flex-shrink-0 w-72">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold" style={{ color: '#7BAED4' }}>{statusLabel(status)}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', color: '#4A7FBB' }}>{grouped[status]?.length || 0}</span>
              </div>
              <div className="space-y-3">
                {(grouped[status] || []).map(item => (
                  <div key={item.id} onClick={() => openItem(item)} className="p-4 rounded-xl border cursor-pointer transition-all hover:border-orange-500/40"
                    style={{ background: statusCardColor(status), borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="flex items-start justify-between mb-2">
                      <p className="font-semibold text-white text-sm">{item.customer_name || 'Unknown'}</p>
                      {isJobs && (item as Job).urgency && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={urgencyColor((item as Job).urgency)}>
                          {(item as Job).urgency}
                        </span>
                      )}
                      {!isJobs && (item as Appointment).is_new_customer && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(74,159,232,0.15)', color: '#4A9FE8' }}>New</span>
                      )}
                    </div>
                    <p className="text-xs mb-1" style={{ color: '#4A9FE8' }}>{isJobs ? (item as Job).job_type : (item as Appointment).service_type}</p>
                    {isJobs ? (
                      <p className="text-xs" style={{ color: '#4A7FBB' }}>{(item as Job).address}</p>
                    ) : (
                      <p className="text-xs" style={{ color: '#4A7FBB' }}>
                        {(item as Appointment).scheduled_at ? new Date((item as Appointment).scheduled_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Time TBC'}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-2" style={{ color: '#4A7FBB' }}>
                      <Phone size={11} /><span className="text-xs">{item.customer_phone}</span>
                    </div>
                  </div>
                ))}
                {(grouped[status] || []).length === 0 && (
                  <div className="p-4 rounded-xl border border-dashed text-center text-xs" style={{ borderColor: 'rgba(255,255,255,0.08)', color: '#4A7FBB' }}>Empty</div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: '#071829' }}>
              <tr>{['Customer', 'Phone', isJobs ? 'Job Type' : 'Service', isJobs ? 'Address' : 'Scheduled', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#4A7FBB' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} onClick={() => openItem(item)} className="cursor-pointer border-t" style={{ background: i % 2 === 0 ? '#0A1E38' : '#071829', borderColor: 'rgba(255,255,255,0.04)' }}>
                  <td className="px-4 py-3 text-white font-medium">{item.customer_name || '—'}</td>
                  <td className="px-4 py-3" style={{ color: '#7BAED4' }}>{item.customer_phone}</td>
                  <td className="px-4 py-3 text-white">{isJobs ? (item as Job).job_type : (item as Appointment).service_type}</td>
                  <td className="px-4 py-3" style={{ color: '#7BAED4' }}>
                    {isJobs ? (item as Job).address : (item as Appointment).scheduled_at ? new Date((item as Appointment).scheduled_at).toLocaleDateString('en-AU') : 'TBC'}
                  </td>
                  <td className="px-4 py-3"><Badge>{statusLabel(item.status)}</Badge></td>
                  <td className="px-4 py-3 text-xs" style={{ color: '#4A7FBB' }}>{new Date(item.created_at).toLocaleDateString('en-AU')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <SheetContent style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.1)', color: 'white', width: '460px' }}>
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="text-white">{selected.customer_name}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg" style={{ background: '#071829' }}>
                    <p className="text-xs mb-1" style={{ color: '#4A7FBB' }}>Phone</p>
                    <p className="font-semibold text-sm text-white">{selected.customer_phone}</p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ background: '#071829' }}>
                    <p className="text-xs mb-1" style={{ color: '#4A7FBB' }}>{isJobs ? 'Job Type' : 'Service'}</p>
                    <p className="font-semibold text-sm text-white">{isJobs ? (selected as Job).job_type : (selected as Appointment).service_type}</p>
                  </div>
                </div>

                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: '#4A7FBB' }}>Status</label>
                  <Select value={editStatus} onValueChange={(v: string) => setEditStatus(v)}>
                    <SelectTrigger style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.1)' }}>
                      {statuses.map(s => <SelectItem key={s} value={s} style={{ color: 'white' }}>{statusLabel(s)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: '#4A7FBB' }}>Notes</label>
                  <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={4}
                    style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
                </div>

                <div className="flex gap-3">
                  <Button onClick={saveItem} disabled={saving} className="flex-1" style={{ background: '#E8622A', color: 'white', border: 'none' }}>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </Button>
                  <Button onClick={sendSmsReminder} variant="outline" className="flex-1 gap-2"
                    style={{ borderColor: '#1565C0', color: '#4A9FE8' }}>
                    <MessageSquare size={14} /> SMS Reminder
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
