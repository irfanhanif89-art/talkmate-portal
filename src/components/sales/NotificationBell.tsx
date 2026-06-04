'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Bell, X, Eye, Clock, ArrowRightLeft, DollarSign, UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { timeAgo } from '@/lib/sales-format'

interface Notification {
  id: string
  type: string
  lead_id: string | null
  message: string
  read: boolean
  created_at: string
}

const NOTIFICATION_META: Record<string, { icon: LucideIcon; color: string }> = {
  proposal_opened:    { icon: Eye,            color: '#E8622A' },
  followup_due:       { icon: Clock,          color: '#f59e0b' },
  deal_reassigned:    { icon: ArrowRightLeft, color: '#4A9FE8' },
  commission_updated: { icon: DollarSign,     color: '#22C55E' },
  new_lead_assigned:  { icon: UserPlus,       color: '#4A9FE8' },
}

interface Props {
  repId: string
}

export default function NotificationBell({ repId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)

  const unreadCount = items.filter(i => !i.read).length

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('rep_notifications')
      .select('id, type, lead_id, message, read, created_at')
      .eq('rep_id', repId)
      .order('created_at', { ascending: false })
      .limit(20)
    setItems((data ?? []) as Notification[])
    setLoading(false)
  }, [repId])

  useEffect(() => {
    void load()
  }, [load])

  // Realtime subscription — pattern from dashboard-client.tsx:162-171
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`rep-notifications-${repId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rep_notifications',
          filter: `rep_id=eq.${repId}`,
        },
        () => { void load() },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [repId, load])

  async function markRead(id: string) {
    const supabase = createClient()
    await supabase.from('rep_notifications').update({ read: true }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, read: true } : i))
  }

  async function markAllRead() {
    const supabase = createClient()
    await supabase.from('rep_notifications').update({ read: true }).eq('rep_id', repId).eq('read', false)
    setItems(prev => prev.map(i => ({ ...i, read: true })))
  }

  async function clickItem(item: Notification) {
    if (!item.read) await markRead(item.id)
    setOpen(false)
    if (item.lead_id) router.push(`/sales/leads?lead=${item.lead_id}`)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Notifications"
        style={{
          position: 'relative',
          background: 'transparent',
          border: '1px solid var(--line)',
          borderRadius: 8, padding: '8px 10px',
          color: 'var(--dim)', cursor: 'pointer',
        }}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            width: 10, height: 10, borderRadius: '50%',
            background: '#ef4444',
            border: '2px solid var(--card)',
          }} />
        )}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
          }}
        >
          <aside
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: 'min(380px, 100vw)',
              background: 'var(--card)',
              color: 'var(--text)',
              borderLeft: '1px solid var(--line)',
              overflowY: 'auto', display: 'flex', flexDirection: 'column',
              zIndex: 201,
            }}
          >
            <div style={{
              padding: '18px 20px',
              borderBottom: '1px solid var(--line)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text)' }}>Notifications</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    style={{
                      background: 'transparent', border: 'none',
                      color: '#E8622A', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                  >Mark all read</button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--line)',
                    borderRadius: 7, padding: 6,
                    color: 'var(--dim)', cursor: 'pointer',
                  }}
                ><X size={14} /></button>
              </div>
            </div>

            <div style={{ flex: 1, padding: '12px 12px 22px' }}>
              {loading && items.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>
                  Loading...
                </div>
              ) : items.length === 0 ? (
                <div style={{
                  padding: 28, textAlign: 'center', color: 'var(--dim)',
                  fontSize: 13, border: '1px dashed var(--line)',
                  borderRadius: 10, margin: '16px 8px',
                }}>You are all caught up.</div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map(item => {
                    const meta = NOTIFICATION_META[item.type] ?? { icon: Bell, color: 'var(--dim)' }
                    const Icon = meta.icon
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => clickItem(item)}
                          style={{
                            width: '100%', textAlign: 'left', cursor: 'pointer',
                            display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 9,
                            background: item.read ? 'transparent' : 'rgba(232,98,42,0.05)',
                            border: '1px solid ' + (item.read ? 'var(--line)' : 'rgba(232,98,42,0.25)'),
                            color: 'var(--text)',
                          }}
                        >
                          <div style={{
                            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                            background: `${meta.color}20`, color: meta.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Icon size={14} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: item.read ? 500 : 700, lineHeight: 1.4 }}>
                              {item.message}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>
                              {timeAgo(item.created_at)}
                            </div>
                          </div>
                          {!item.read && (
                            <span style={{
                              width: 7, height: 7, borderRadius: '50%',
                              background: '#E8622A', flexShrink: 0, marginTop: 8,
                            }} />
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
