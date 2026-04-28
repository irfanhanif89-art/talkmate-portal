'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessType } from '@/context/business-type-context'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Star, Edit, Trash2, Zap } from 'lucide-react'
import MenuImportBanner from '@/components/portal/menu-import-banner'

interface CatalogItem {
  id: string; name: string; description: string; price: number | null
  category: string; active: boolean; upsell_prompt: string | null
  duration_minutes: number | null; is_featured: boolean; sort_order: number
}

const emptyItem = (): Partial<CatalogItem> => ({ name: '', description: '', price: null, category: '', active: true, upsell_prompt: '', duration_minutes: null, is_featured: false })

export default function CatalogPage() {
  const { config, businessId } = useBusinessType()
  const supabase = createClient()
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<CatalogItem>>(emptyItem())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncToast, setSyncToast] = useState(false)
  const [lastSynced, setLastSynced] = useState<number | null>(null)

  useEffect(() => {
    const t = localStorage.getItem('catalog_last_synced')
    if (t) setLastSynced(parseInt(t))
  }, [])

  function timeAgoMs(ms: number) {
    const diff = Date.now() - ms
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m} minute${m > 1 ? 's' : ''} ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`
    return `${Math.floor(h / 24)} day${Math.floor(h / 24) > 1 ? 's' : ''} ago`
  }
  const [syncMsg, setSyncMsg] = useState('')

  useEffect(() => { fetchItems() }, [businessId])

  async function fetchItems() {
    const { data } = await supabase.from('catalog_items').select('*').eq('business_id', businessId).order('sort_order')
    setItems(data ?? [])
    setLoading(false)
  }

  function openAdd() { setEditing(emptyItem()); setEditingId(null); setSheetOpen(true) }
  function openEdit(item: CatalogItem) { setEditing({ ...item }); setEditingId(item.id); setSheetOpen(true) }

  async function save() {
    if (!editing.name) return
    if (editingId) {
      await supabase.from('catalog_items').update({ ...editing }).eq('id', editingId)
    } else {
      await supabase.from('catalog_items').insert({ ...editing, business_id: businessId, sort_order: items.length })
    }
    setSheetOpen(false)
    fetchItems()
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this item?')) return
    await supabase.from('catalog_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  async function toggleActive(item: CatalogItem) {
    await supabase.from('catalog_items').update({ active: !item.active }).eq('id', item.id)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, active: !i.active } : i))
  }

  async function toggleFeatured(item: CatalogItem) {
    await supabase.from('catalog_items').update({ is_featured: !item.is_featured }).eq('id', item.id)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_featured: !i.is_featured } : i))
  }

  async function syncToAI() {
    setSyncing(true); setSyncMsg('')
    const res = await fetch('/api/vapi/sync', { method: 'POST' })
    setSyncing(false)
    if (res.ok) {
      const now = Date.now()
      localStorage.setItem('catalog_last_synced', now.toString())
      setLastSynced(now)
      setSyncToast(true)
      setTimeout(() => setSyncToast(false), 3000)
    } else {
      setSyncMsg('❌ Sync failed — check Vapi settings')
      setTimeout(() => setSyncMsg(''), 4000)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">{config.catalogLabel}</h1>
          <p className="text-sm mt-1" style={{ color: '#4A7FBB' }}>{items.length} {config.catalogItemLabel.toLowerCase()}s</p>
        </div>
        <div className="flex gap-3 items-center">
          {syncMsg && <span className="text-sm">{syncMsg}</span>}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <Button onClick={syncToAI} disabled={syncing} variant="outline" className="gap-2"
              style={{ borderColor: '#1565C0', color: '#4A9FE8' }}>
              <Zap size={14} />{syncing ? 'Syncing…' : 'Save & Sync to AI'}
            </Button>
            {lastSynced && (
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Last synced to AI: {timeAgoMs(lastSynced)}</span>
            )}
          </div>
          <Button onClick={openAdd} className="gap-2" style={{ background: '#E8622A', color: 'white', border: 'none' }}>
            <Plus size={16} /> Add {config.catalogItemLabel}
          </Button>
        </div>
      </div>

      <MenuImportBanner onImported={() => fetchItems()} />

      {loading ? (
        <p style={{ color: '#4A7FBB' }}>Loading…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-lg font-semibold text-white mb-2">No {config.catalogItemLabel.toLowerCase()}s yet</p>
          <p className="text-sm mb-6" style={{ color: '#4A7FBB' }}>Add your first {config.catalogItemLabel.toLowerCase()} so your AI agent knows what to discuss.</p>
          <Button onClick={openAdd} style={{ background: '#E8622A', color: 'white', border: 'none' }}>
            <Plus size={16} className="mr-2" /> Add {config.catalogItemLabel}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => (
            <div key={item.id} className="p-5 rounded-xl border relative" style={{ background: '#0A1E38', borderColor: item.is_featured ? 'rgba(232,98,42,0.4)' : 'rgba(255,255,255,0.06)', opacity: item.active ? 1 : 0.5 }}>
              {item.is_featured && (
                <span className="absolute top-3 right-3 flex items-center gap-1 text-xs font-semibold" style={{ color: '#E8622A' }}>
                  <Star size={12} fill="currentColor" /> Featured
                </span>
              )}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-xs px-2 py-0.5 rounded-full mb-2 inline-block" style={{ background: 'rgba(74,159,232,0.1)', color: '#4A9FE8' }}>{item.category}</span>
                  <h3 className="font-semibold text-white">{item.name}</h3>
                </div>
              </div>
              {item.description && <p className="text-sm mb-3 line-clamp-2" style={{ color: '#7BAED4' }}>{item.description}</p>}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {config.hasPricing && item.price != null && (
                    <span className="font-bold" style={{ color: '#E8622A' }}>${item.price}</span>
                  )}
                  {item.duration_minutes && (
                    <span className="text-xs" style={{ color: '#4A7FBB' }}>{item.duration_minutes} min</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleFeatured(item)} title="Toggle featured" style={{ color: item.is_featured ? '#E8622A' : '#4A7FBB' }}>
                    <Star size={15} fill={item.is_featured ? 'currentColor' : 'none'} />
                  </button>
                  <Switch checked={item.active} onCheckedChange={() => toggleActive(item)} />
                  <button onClick={() => openEdit(item)} style={{ color: '#4A9FE8' }}><Edit size={14} /></button>
                  <button onClick={() => deleteItem(item.id)} style={{ color: '#ef4444' }}><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent style={{ background: '#0A1E38', borderColor: 'rgba(255,255,255,0.1)', color: 'white', width: '480px' }}>
          <SheetHeader>
            <SheetTitle className="text-white">{editingId ? 'Edit' : 'Add'} {config.catalogItemLabel}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div>
              <Label className="text-xs mb-1.5 block" style={{ color: '#4A7FBB' }}>Name *</Label>
              <Input value={editing.name || ''} onChange={e => setEditing(v => ({ ...v, name: e.target.value }))}
                style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block" style={{ color: '#4A7FBB' }}>Description</Label>
              <Textarea value={editing.description || ''} onChange={e => setEditing(v => ({ ...v, description: e.target.value }))}
                style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} rows={3} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block" style={{ color: '#4A7FBB' }}>Category</Label>
              <Select value={editing.category || ''} onValueChange={(v: string) => setEditing(e => ({ ...e, category: v }))}>
                <SelectTrigger style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
                  <SelectValue placeholder="Select category…" />
                </SelectTrigger>
                <SelectContent style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {config.catalogCategories.map(c => <SelectItem key={c} value={c} style={{ color: 'white' }}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {config.hasPricing && (
              <div>
                <Label className="text-xs mb-1.5 block" style={{ color: '#4A7FBB' }}>Price ($)</Label>
                <Input type="number" value={editing.price ?? ''} onChange={e => setEditing(v => ({ ...v, price: e.target.value ? Number(e.target.value) : null }))}
                  style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
              </div>
            )}
            {config.hasAppointments && (
              <div>
                <Label className="text-xs mb-1.5 block" style={{ color: '#4A7FBB' }}>Duration (minutes)</Label>
                <Input type="number" value={editing.duration_minutes ?? ''} onChange={e => setEditing(v => ({ ...v, duration_minutes: e.target.value ? Number(e.target.value) : null }))}
                  style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
              </div>
            )}
            {config.hasUpsells && (
              <div>
                <Label className="text-xs mb-1.5 block" style={{ color: '#4A7FBB' }}>AI Upsell Prompt</Label>
                <Textarea value={editing.upsell_prompt || ''} onChange={e => setEditing(v => ({ ...v, upsell_prompt: e.target.value }))}
                  placeholder='e.g. "Would you like to add garlic bread for $3?"'
                  style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} rows={2} />
              </div>
            )}
            <div className="flex items-center gap-3">
              <Switch checked={editing.is_featured ?? false} onCheckedChange={v => setEditing(e => ({ ...e, is_featured: v }))} />
              <Label className="text-sm" style={{ color: '#7BAED4' }}>AI mentions this proactively (featured)</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={editing.active ?? true} onCheckedChange={v => setEditing(e => ({ ...e, active: v }))} />
              <Label className="text-sm" style={{ color: '#7BAED4' }}>Active</Label>
            </div>
            <Button onClick={save} className="w-full" style={{ background: '#E8622A', color: 'white', border: 'none' }}>
              Save {config.catalogItemLabel}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Sync success toast */}
      {syncToast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, background: '#22C55E', color: 'white', borderRadius: 10, padding: '12px 20px', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit,sans-serif', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20,6 9,17 4,12"/></svg>
          Changes synced to your AI agent
        </div>
      )}
    </div>
  )
}
