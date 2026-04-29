'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus } from 'lucide-react'
import CustomListBuilder from '@/components/portal/custom-list-builder'

interface SmartList {
  id: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  is_system: boolean
  contact_count: number | null
  last_refreshed_at: string | null
}

export default function SmartListsClient({ initialLists, industry }: {
  initialLists: SmartList[]
  industry: string | null
}) {
  const router = useRouter()
  const [lists, setLists] = useState(initialLists)
  const [builderOpen, setBuilderOpen] = useState(false)

  const system = lists.filter(l => l.is_system)
  const custom = lists.filter(l => !l.is_system)

  async function handleCreated(id: string) {
    // Reload from server so the new card has the right count.
    const res = await fetch('/api/smart-lists')
    const data = await res.json()
    if (data.ok) setLists(data.lists)
    router.push(`/contacts/smart-lists/${id}`)
  }

  return (
    <div style={{ padding: 28, color: '#F2F6FB' }}>
      <Link href="/contacts" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#7BAED4', textDecoration: 'none', marginBottom: 18 }}>
        <ArrowLeft size={14} /> All contacts
      </Link>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', marginBottom: 6 }}>Smart lists</h1>
        <p style={{ fontSize: 13, color: '#7BAED4' }}>
          Filtered views of your contacts. System lists update automatically. Custom lists are yours to build.
        </p>
      </div>

      <Section title="System lists" lists={system} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 32, marginBottom: 12 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Custom lists</h2>
        <button
          onClick={() => setBuilderOpen(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#E8622A', color: 'white', border: 'none', borderRadius: 9, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit, sans-serif' }}
        >
          <Plus size={13} /> Create custom list
        </button>
      </div>
      {custom.length === 0 ? (
        <div style={{ background: '#0A1E38', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 14, padding: 32, textAlign: 'center', fontSize: 13, color: '#7BAED4' }}>
          No custom lists yet. Click <strong style={{ color: 'white' }}>Create custom list</strong> to build your first one.
        </div>
      ) : (
        <Section title="" lists={custom} hideHeading />
      )}

      <CustomListBuilder
        open={builderOpen}
        industry={industry}
        onClose={() => setBuilderOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  )
}

function Section({ title, lists, hideHeading }: { title: string; lists: SmartList[]; hideHeading?: boolean }) {
  if (lists.length === 0) return null
  return (
    <div style={{ marginTop: hideHeading ? 0 : 0 }}>
      {!hideHeading && (
        <h2 style={{ fontSize: 13, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>{title}</h2>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {lists.map(l => (
          <Link
            key={l.id}
            href={`/contacts/smart-lists/${l.id}`}
            style={{
              background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 18,
              borderLeft: `3px solid ${l.color ?? '#1565C0'}`,
              textDecoration: 'none', display: 'block',
              transition: 'transform 0.15s, border-color 0.15s',
            }}
            className="smart-list-card"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 22 }}>{l.icon ?? '📋'}</span>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{l.name}</div>
            </div>
            {l.description && (
              <div style={{ fontSize: 12, color: '#7BAED4', marginTop: 4, lineHeight: 1.5, minHeight: 36 }}>{l.description}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: l.color ?? '#1565C0' }}>{l.contact_count ?? 0}</span>
              <span style={{ fontSize: 11, color: '#4A7FBB' }}>
                {l.last_refreshed_at ? `Updated ${new Date(l.last_refreshed_at).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}` : 'Pending refresh'}
              </span>
            </div>
          </Link>
        ))}
      </div>
      <style>{`.smart-list-card:hover { transform: translateY(-2px); border-color: rgba(232,98,42,0.3) !important; }`}</style>
    </div>
  )
}
