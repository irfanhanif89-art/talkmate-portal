'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBusinessType } from '@/context/business-type-context'
import SyncAgentButton, { silentSyncAgent } from '@/components/portal/sync-agent-button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch as ShadSwitch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Star, Edit, Trash2, RefreshCw, Settings as SettingsIcon, GripVertical, Clock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import MenuImportBanner from '@/components/portal/menu-import-banner'
import type { Service } from '@/lib/service-templates'
import { Chips } from '@/components/portal/ui-v2/chips'
import { ButtonV2 } from '@/components/portal/ui-v2/button'
import { Switch } from '@/components/portal/ui-v2/switch'
import { Panel, PanelHeader } from '@/components/portal/ui-v2/panel'
import { Tag } from '@/components/portal/ui-v2/tag'
import type { TagVariant } from '@/components/portal/ui-v2/tag'

interface CatalogItem {
  id: string; name: string; description: string; price: number | null
  category: string; active: boolean; upsell_prompt: string | null
  duration_minutes: number | null; is_featured: boolean; sort_order: number
}

// Source of truth fallback: for towing-style businesses, pricing lives in
// businesses.services (Agent Settings) rather than catalog_items. If the
// catalog is empty but services exist, show those instead of "No services yet".
interface NotifConfigServiceRow {
  name: string
  price?: number | string
  category?: string
  description?: string
}

const emptyItem = (): Partial<CatalogItem> => ({ name: '', description: '', price: null, category: '', active: true, upsell_prompt: '', duration_minutes: null, is_featured: false })

// CatalogPage accepts optional admin overrides so it can also be
// rendered under /admin/clients/[clientId]/portal/catalog. When
// adminClientId is set the page operates on that client's business id
// and routes silent syncs through the admin sync endpoint.
interface CatalogPageProps {
  adminClientId?: string | null
  adminBusinessId?: string | null
  adminHasAgent?: boolean
  adminLastSyncedAt?: string | null
}

// Map catalog categories to Tag variants
function categoryToTagVariant(category: string): TagVariant {
  const lower = category.toLowerCase()
  if (lower.includes('emergency')) return 'emergency'
  if (lower.includes('schedule') || lower.includes('appointment')) return 'question'
  if (lower.includes('quote') || lower.includes('estimate')) return 'quote'
  if (lower.includes('maintenance') || lower.includes('service')) return 'book'
  return 'question'
}

type FilterChip = 'all' | string

export default function CatalogPage({
  adminClientId = null,
  adminBusinessId = null,
  adminHasAgent = true,
  adminLastSyncedAt = null,
}: CatalogPageProps = {}) {
  const ctx = useBusinessType()
  // In admin mode, override the in-portal business id with the scoped
  // client. The catalog config (labels, categories, pricing flag) still
  // comes from BusinessType context derived from the layout.
  const businessId = adminBusinessId ?? ctx.businessId
  const config = ctx.config
  const supabase = createClient()
  const router = useRouter()
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<CatalogItem>>(emptyItem())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncToast, setSyncToast] = useState(false)
  const [lastSynced, setLastSynced] = useState<number | null>(null)
  const [activeChip, setActiveChip] = useState<FilterChip>('all')
  // Services-derived fallback display (towing & similar businesses that
  // manage pricing in Agent Settings rather than the catalog).
  const [fallbackServices, setFallbackServices] = useState<NotifConfigServiceRow[]>([])
  const [industry, setIndustry] = useState<string | null>(null)

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
    const list = data ?? []
    setItems(list)

    // If catalog_items is empty, fall back to the data the business already
    // manages elsewhere so the page never shows "No services yet" when prices
    // exist. Source of truth precedence:
    //   1. businesses.services (Agent Settings → AI Voice Agent → Services)
    //   2. notifications_config.services (legacy admin-entered price list)
    if (list.length === 0 && businessId) {
      const { data: biz } = await supabase
        .from('businesses')
        .select('industry, services, notifications_config')
        .eq('id', businessId)
        .maybeSingle()
      if (biz) {
        const b = biz as Record<string, unknown>
        setIndustry((b.industry as string) ?? null)
        const svc = Array.isArray(b.services) ? b.services as Service[] : []
        const cfg = (b.notifications_config ?? {}) as Record<string, unknown>
        const cfgSvc = Array.isArray(cfg.services)
          ? cfg.services as NotifConfigServiceRow[]
          : []
        const enabledFromBiz = svc
          .filter(s => s && s.name && s.enabled !== false)
          .map<NotifConfigServiceRow>(s => ({ name: s.name, price: s.price || undefined }))
        setFallbackServices(enabledFromBiz.length > 0 ? enabledFromBiz : cfgSvc)
      }
    } else {
      setFallbackServices([])
    }

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
    silentSyncAgent(adminClientId)
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this item?')) return
    await supabase.from('catalog_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    silentSyncAgent(adminClientId)
  }

  async function toggleActive(item: CatalogItem) {
    await supabase.from('catalog_items').update({ active: !item.active }).eq('id', item.id)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, active: !i.active } : i))
    silentSyncAgent(adminClientId)
  }

  async function toggleFeatured(item: CatalogItem) {
    await supabase.from('catalog_items').update({ is_featured: !item.is_featured }).eq('id', item.id)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_featured: !i.is_featured } : i))
    silentSyncAgent(adminClientId)
  }

  async function syncToAI() {
    setSyncing(true); setSyncMsg('')
    const url = adminClientId
      ? `/api/admin/vapi/sync?clientId=${encodeURIComponent(adminClientId)}`
      : '/api/vapi/sync'
    const res = await fetch(url, { method: 'POST' })
    setSyncing(false)
    if (res.ok) {
      const now = Date.now()
      localStorage.setItem('catalog_last_synced', now.toString())
      setLastSynced(now)
      setSyncToast(true)
      setTimeout(() => setSyncToast(false), 3000)
    } else {
      setSyncMsg('Sync failed — check Vapi settings')
      setTimeout(() => setSyncMsg(''), 4000)
    }
  }

  // Compute unique categories for chips filter
  const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean)))

  const chipDefs = [
    { value: 'all' as FilterChip, label: 'All', count: items.length },
    ...categories.map(cat => ({
      value: cat as FilterChip,
      label: cat,
      count: items.filter(i => i.category === cat).length,
    })),
  ]

  const filteredItems = activeChip === 'all' ? items : items.filter(i => i.category === activeChip)

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="flex items-center gap-4 px-7 h-[68px] border-b border-line flex-shrink-0">
        <h1 className="text-[20px] font-extrabold tracking-[-0.4px] text-text">{config.catalogLabel}</h1>
        <span className="text-[13px] text-faint">
          {items.length} {config.catalogItemLabel.toLowerCase()}s · drag to reorder
        </span>
        <div className="ml-auto flex items-center gap-2.5">
          {syncMsg && <span className="text-[12px] text-red-400">{syncMsg}</span>}
          <SyncAgentButton
            hasAgent={adminHasAgent}
            initialLastSyncedAt={adminLastSyncedAt}
            adminClientId={adminClientId}
          />
          <ButtonV2 variant="primary" onClick={openAdd} className="gap-1.5">
            <Plus size={15} /> Add {config.catalogItemLabel}
          </ButtonV2>
        </div>
      </header>

      {/* ── Filter bar ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-7 h-[54px] border-b border-line flex-shrink-0">
        <Chips chips={chipDefs} value={activeChip} onChange={setActiveChip} />
      </div>

      <MenuImportBanner onImported={() => fetchItems()} />

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] overflow-hidden">
        {/* LEFT — service grid */}
        <div className="overflow-y-auto p-7">
          {loading ? (
            <p className="text-dim text-[13px]">Loading…</p>
          ) : items.length === 0 && fallbackServices.length > 0 ? (
            <ServicesFromAgentSettings
              services={fallbackServices}
              industry={industry}
              onManage={() => router.push('/settings')}
            />
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-[16px] font-semibold text-text mb-2">No {config.catalogItemLabel.toLowerCase()}s yet</p>
              <p className="text-[13px] text-dim mb-6">Add your first {config.catalogItemLabel.toLowerCase()} so your AI agent knows what to discuss.</p>
              <ButtonV2 variant="primary" onClick={openAdd}>
                <Plus size={15} className="mr-1.5" /> Add {config.catalogItemLabel}
              </ButtonV2>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredItems.map(item => (
                <ServiceCard
                  key={item.id}
                  item={item}
                  config={config}
                  onEdit={openEdit}
                  onDelete={deleteItem}
                  onToggleActive={toggleActive}
                  onToggleFeatured={toggleFeatured}
                />
              ))}
            </div>
          )}
        </div>

        {/* RIGHT — Sync panel */}
        <div className="border-l border-line bg-sidebar flex flex-col p-6 gap-0 overflow-y-auto">
          <h2 className="text-[15px] font-extrabold tracking-[-0.2px] text-text mb-1.5">Sync to AI Agent</h2>
          <p className="text-[12.5px] text-dim leading-[1.55] mb-5">
            Your AI receptionist uses this service list to answer pricing questions, book jobs, and capture quotes accurately.
          </p>

          {/* Last synced status */}
          <div className="bg-card border border-line rounded-[12px] p-3.5 mb-4 shadow-[0_1px_4px_rgba(0,0,0,.28)]">
            <div className="text-[11.5px] text-faint mb-1">Last synced</div>
            <div className="flex items-center gap-1.5 text-[13.5px] font-bold text-text">
              <span className="w-2 h-2 rounded-full bg-green flex-shrink-0" />
              {lastSynced ? `${timeAgoMs(lastSynced)} · ${items.length} services` : 'Never'}
            </div>
          </div>

          {/* Sync button */}
          <ButtonV2
            variant="primary"
            onClick={syncToAI}
            disabled={syncing}
            className="w-full justify-center gap-2 py-3 text-[13.5px] font-extrabold shadow-[0_6px_18px_rgba(238,106,44,.4)] mb-2.5"
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Save & Sync to AI'}
          </ButtonV2>

          <p className="text-[11px] text-faint text-center leading-[1.5] mb-5">
            Changes go live on your receptionist within 30 seconds.
          </p>

          {/* Success toast (inline in panel) */}
          {syncToast && (
            <div className="flex items-center gap-2 bg-green text-white rounded-[10px] p-3 text-[13px] font-bold mb-4">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Changes synced to your AI agent
            </div>
          )}

          {/* AI knows about chips */}
          {items.length > 0 && (
            <div className="bg-card border border-line rounded-[12px] p-3.5 shadow-[0_1px_4px_rgba(0,0,0,.28)]">
              <h3 className="text-[11.5px] font-bold text-faint uppercase tracking-[0.08em] mb-2.5">AI now knows about</h3>
              <div className="flex flex-wrap">
                {items.filter(i => i.active).map(item => (
                  <span
                    key={item.id}
                    className="inline-flex items-center gap-1 bg-[rgba(238,106,44,.1)] border border-[rgba(238,106,44,.2)] rounded-[7px] px-2 py-1 text-[11.5px] font-semibold text-orange m-0.5"
                  >
                    {item.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Add / Edit Sheet ─────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent style={{ background: 'var(--card)', borderColor: 'var(--line)', color: 'var(--text)', width: '480px' }}>
          <SheetHeader>
            <SheetTitle className="text-text">{editingId ? 'Edit' : 'Add'} {config.catalogItemLabel}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div>
              <Label className="text-xs mb-1.5 block text-faint">Name *</Label>
              <Input value={editing.name || ''} onChange={e => setEditing(v => ({ ...v, name: e.target.value }))}
                style={{ background: 'var(--card-2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block text-faint">Description</Label>
              <Textarea value={editing.description || ''} onChange={e => setEditing(v => ({ ...v, description: e.target.value }))}
                style={{ background: 'var(--card-2)', border: '1px solid var(--line)', color: 'var(--text)' }} rows={3} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block text-faint">Category</Label>
              <Select value={editing.category || ''} onValueChange={(v) => setEditing(e => ({ ...e, category: v ?? '' }))}>
                <SelectTrigger style={{ background: 'var(--card-2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                  <SelectValue placeholder="Select category…" />
                </SelectTrigger>
                <SelectContent style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
                  {config.catalogCategories.map(c => <SelectItem key={c} value={c} style={{ color: 'var(--text)' }}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {config.hasPricing && (
              <div>
                <Label className="text-xs mb-1.5 block text-faint">Price ($)</Label>
                <Input type="number" value={editing.price ?? ''} onChange={e => setEditing(v => ({ ...v, price: e.target.value ? Number(e.target.value) : null }))}
                  style={{ background: 'var(--card-2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
              </div>
            )}
            {config.hasAppointments && (
              <div>
                <Label className="text-xs mb-1.5 block text-faint">Duration (minutes)</Label>
                <Input type="number" value={editing.duration_minutes ?? ''} onChange={e => setEditing(v => ({ ...v, duration_minutes: e.target.value ? Number(e.target.value) : null }))}
                  style={{ background: 'var(--card-2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
              </div>
            )}
            {config.hasUpsells && (
              <div>
                <Label className="text-xs mb-1.5 block text-faint">AI Upsell Prompt</Label>
                <Textarea value={editing.upsell_prompt || ''} onChange={e => setEditing(v => ({ ...v, upsell_prompt: e.target.value }))}
                  placeholder='e.g. "Would you like to add garlic bread for $3?"'
                  style={{ background: 'var(--card-2)', border: '1px solid var(--line)', color: 'var(--text)' }} rows={2} />
              </div>
            )}
            <div className="flex items-center gap-3">
              <ShadSwitch checked={editing.is_featured ?? false} onCheckedChange={v => setEditing(e => ({ ...e, is_featured: v }))} />
              <Label className="text-sm text-dim">AI mentions this proactively (featured)</Label>
            </div>
            <div className="flex items-center gap-3">
              <ShadSwitch checked={editing.active ?? true} onCheckedChange={v => setEditing(e => ({ ...e, active: v }))} />
              <Label className="text-sm text-dim">Active</Label>
            </div>
            <Button onClick={save} className="w-full bg-orange text-white border-none hover:opacity-90">
              Save {config.catalogItemLabel}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ── Service Card ──────────────────────────────────────────────────────────────
function ServiceCard({
  item,
  config,
  onEdit,
  onDelete,
  onToggleActive,
  onToggleFeatured,
}: {
  item: CatalogItem
  config: ReturnType<typeof useBusinessType>['config']
  onEdit: (item: CatalogItem) => void
  onDelete: (id: string) => void
  onToggleActive: (item: CatalogItem) => void
  onToggleFeatured: (item: CatalogItem) => void
}) {
  const tagVariant = categoryToTagVariant(item.category)

  return (
    <div
      className={[
        'bg-card border border-line rounded-[var(--r)] p-[18px] relative cursor-grab',
        'shadow-[0_1px_4px_rgba(0,0,0,.28)]',
        'hover:border-[rgba(255,255,255,.12)] transition-colors',
        !item.active && 'opacity-50',
      ].filter(Boolean).join(' ')}
    >
      {/* Drag handle */}
      <div className="absolute top-3 left-3 text-faint">
        <GripVertical size={14} />
      </div>

      {/* Featured star */}
      {item.is_featured && (
        <span className="absolute top-3 right-3 text-gold text-[14px]">★</span>
      )}

      {/* Category tag */}
      {item.category && (
        <div className="ml-5 mb-2.5">
          <Tag variant={tagVariant}>{item.category}</Tag>
        </div>
      )}

      {/* Name */}
      <h3 className="text-[14.5px] font-extrabold text-text mb-1.5 leading-snug">{item.name}</h3>

      {/* Description */}
      {item.description && (
        <p className="text-[12px] text-dim leading-[1.5] mb-3 line-clamp-2">{item.description}</p>
      )}

      {/* Price + duration */}
      <div className="flex items-center gap-2.5 mb-3">
        {config.hasPricing && item.price != null && (
          <span className="text-[16px] font-extrabold text-orange">${item.price}</span>
        )}
        {item.duration_minutes != null && (
          <span className="flex items-center gap-1 text-[12px] text-faint">
            <Clock size={12} /> {item.duration_minutes} min
          </span>
        )}
      </div>

      {/* Footer: active toggle + edit/delete */}
      <div className="flex items-center gap-1.5 pt-3 border-t border-line">
        <div className="flex items-center gap-1.5">
          <Switch variant="green" checked={item.active} onChange={() => onToggleActive(item)} aria-label="Toggle active" />
          <span className={`text-[12px] ${item.active ? 'text-green' : 'text-faint'}`}>
            {item.active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => onToggleFeatured(item)}
            title="Toggle featured"
            className="w-7 h-7 rounded-[8px] bg-card-2 border border-line flex items-center justify-center hover:border-[rgba(255,255,255,.2)] transition-colors"
          >
            <Star size={13} className={item.is_featured ? 'text-gold' : 'text-dim'} fill={item.is_featured ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={() => onEdit(item)}
            className="w-7 h-7 rounded-[8px] bg-card-2 border border-line flex items-center justify-center hover:border-[rgba(255,255,255,.2)] transition-colors"
          >
            <Edit size={13} className="text-dim" />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="w-7 h-7 rounded-[8px] bg-card-2 border border-line flex items-center justify-center hover:border-red hover:text-red transition-colors"
          >
            <Trash2 size={13} className="text-dim" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Read-only fallback panel ──────────────────────────────────────────────────
// Surfaces the prices a business has already configured in Agent Settings
// (businesses.services or the legacy notifications_config.services) so the
// catalog page never shows "No services yet" when real pricing exists elsewhere.
function ServicesFromAgentSettings({
  services,
  industry,
  onManage,
}: {
  services: NotifConfigServiceRow[]
  industry: string | null
  onManage: () => void
}) {
  // Group by category if categories exist; otherwise one flat list.
  const grouped: Record<string, NotifConfigServiceRow[]> = {}
  let hasCategories = false
  for (const s of services) {
    const cat = s.category?.trim()
    if (cat) hasCategories = true
    const key = cat || 'Services & Pricing'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(s)
  }
  const isTowingLike = industry === 'towing' || industry === 'transport' || industry === 'roadside'

  return (
    <div>
      <div className="flex items-start gap-3 bg-[rgba(74,159,232,.06)] border border-[rgba(74,159,232,.2)] rounded-[12px] p-4 mb-5">
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-text mb-1">
            {isTowingLike
              ? 'Your pricing is managed in Agent Settings'
              : 'These prices are pulled from your AI agent configuration'}
          </p>
          <p className="text-[12px] text-dim">
            Edit names, prices, and which services are active in Agent Settings → AI Voice Agent.
          </p>
        </div>
        <Button
          onClick={onManage}
          variant="outline"
          className="gap-2 flex-shrink-0 whitespace-nowrap"
          style={{ borderColor: 'var(--orange)', color: 'var(--orange)' }}
        >
          <SettingsIcon size={14} /> Manage in Agent Settings
        </Button>
      </div>

      {Object.entries(grouped).map(([cat, rows]) => (
        <div key={cat} className="mb-6">
          {hasCategories && (
            <div className="text-[12px] font-bold text-orange uppercase tracking-[0.1em] mb-2.5">{cat}</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {rows.map((item, i) => (
              <div key={`${cat}-${i}`} className="bg-card border border-line rounded-[var(--r)] p-[18px] shadow-[0_1px_4px_rgba(0,0,0,.28)]">
                <h3 className="font-semibold text-text text-[14px] mb-1.5">{item.name}</h3>
                {item.description && <p className="text-[12px] text-dim mb-3">{item.description}</p>}
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-[15px]" style={{ color: item.price ? 'var(--orange)' : 'var(--dim)' }}>
                    {item.price
                      ? (typeof item.price === 'string'
                        ? (item.price.startsWith('$') ? item.price : '$' + item.price)
                        : '$' + item.price)
                      : 'POA'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
