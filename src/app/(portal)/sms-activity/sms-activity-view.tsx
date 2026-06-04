'use client'

import { useMemo, useState } from 'react'
import {
  getSmsLabel,
  formatAuPhone,
  clientSmsStatus,
  SMS_FILTER_BUCKETS,
} from '@/lib/sms-labels'
import { StatsBar } from '@/components/portal/ui-v2/stats-bar'
import { Panel, PanelHeader } from '@/components/portal/ui-v2/panel'
import { ButtonV2 } from '@/components/portal/ui-v2/button'

export interface SmsActivityRow {
  id: string
  to_phone: string | null
  message: string
  sms_type: string | null
  status: string | null
  sent_at: string | null
  call_id: string | null
}

function monthKey(iso: string | null): string {
  if (!iso) return 'unknown'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  if (key === 'unknown') return 'Unknown'
  const [y, m] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).replace(' am', 'am').replace(' pm', 'pm')
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short',
  })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).replace(' am', 'am').replace(' pm', 'pm')
}

function initials(phone: string | null): string {
  if (!phone) return '?'
  const digits = phone.replace(/\D/g, '')
  return digits.slice(-2)
}

const BUCKETS = ['All', ...Object.keys(SMS_FILTER_BUCKETS)] as const
type BucketKey = typeof BUCKETS[number]

// Map sms_type to a Tag-like colour class for message bubbles
function smsTypeClass(smsType: string | null): string {
  if (!smsType) return 'bg-[rgba(91,155,217,.14)] text-blue'
  if (smsType === 'booking_confirmation') return 'bg-green-soft text-green'
  if (smsType.startsWith('booking_reminder') || smsType === 'callback_reminder') return 'bg-[rgba(242,181,60,.14)] text-gold'
  if (smsType.includes('recovery') || smsType === 'dropped_call_recovery' || smsType === 'early_hangup_recovery' || smsType === 'missed_lead_recovery') return 'bg-[rgba(240,98,90,.16)] text-red'
  if (smsType === 'booking_cancellation') return 'bg-[rgba(240,98,90,.16)] text-red'
  if (smsType.startsWith('waitlist')) return 'bg-[rgba(238,106,44,.14)] text-orange'
  return 'bg-[rgba(91,155,217,.14)] text-blue'
}

// Static SMS templates (content fixed by TalkMate platform, not from DB)
const SMS_TEMPLATES = [
  {
    typeLabel: 'Booking confirm',
    typeClass: 'text-orange',
    name: 'Booking Confirmation',
    preview: 'Hi {name}, your booking is confirmed for {date} at {time}. Reply CANCEL to cancel.',
  },
  {
    typeLabel: 'Missed call',
    typeClass: 'text-red',
    name: 'Missed Call Follow-up',
    preview: "Hi, this is TalkMate. We missed your call — we'd love to help. Call us back or reply to book a time.",
  },
  {
    typeLabel: 'Reminder',
    typeClass: 'text-blue',
    name: 'Job Reminder',
    preview: 'Reminder: our team is arriving tomorrow, {date} at {time}. Reply YES to confirm or call to reschedule.',
  },
  {
    typeLabel: 'Waitlist',
    typeClass: 'text-gold',
    name: 'Waitlist Update',
    preview: 'Great news, {name}! A spot has opened up for {date} at {time}. Reply YES to claim it (offer expires in 2h).',
  },
  {
    typeLabel: 'Cancellation',
    typeClass: 'text-red',
    name: 'Cancellation Notice',
    preview: 'Hi {name}, your booking on {date} at {time} has been cancelled. Call us to rebook.',
  },
]

export default function SmsActivityView({
  rows, used, cap,
}: {
  rows: SmsActivityRow[]
  used: number
  cap: number
}) {
  const months = useMemo(() => {
    const set = new Set(rows.map(r => monthKey(r.sent_at)))
    const current = monthKey(new Date().toISOString())
    set.add(current)
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [rows])

  const [month, setMonth] = useState(() => monthKey(new Date().toISOString()))
  const [bucket, setBucket] = useState<BucketKey>('All')
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'threads' | 'conversation'>('threads')

  // Filter rows by month + bucket
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (monthKey(r.sent_at) !== month) return false
      if (bucket === 'All') return true
      const allowed = SMS_FILTER_BUCKETS[bucket]
      return !!r.sms_type && allowed?.has(r.sms_type)
    })
  }, [rows, month, bucket])

  // Stats from filtered rows
  const stats = useMemo(() => {
    let delivered = 0
    for (const r of filtered) {
      if (r.status === 'sent') delivered++
    }
    const total = filtered.length
    const deliveryRate = total > 0 ? Math.round((delivered / total) * 100) : 0
    return { total, delivered, pending: total - delivered, deliveryRate }
  }, [filtered])

  // Group into threads by phone number
  const threads = useMemo(() => {
    const map = new Map<string, SmsActivityRow[]>()
    for (const r of filtered) {
      const key = r.to_phone ?? 'unknown'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    // Sort threads by most recent message
    return Array.from(map.entries())
      .map(([phone, msgs]) => ({
        phone,
        msgs: msgs.sort((a, b) => (b.sent_at ?? '').localeCompare(a.sent_at ?? '')),
        latest: msgs.reduce((acc, r) => (!acc || (r.sent_at ?? '') > (acc.sent_at ?? '')) ? r : acc, msgs[0]!),
      }))
      .sort((a, b) => (b.latest.sent_at ?? '').localeCompare(a.latest.sent_at ?? ''))
  }, [filtered])

  // Auto-select first thread
  const activePhone = selectedPhone ?? threads[0]?.phone ?? null
  const activeThread = threads.find(t => t.phone === activePhone)
  const activeMessages = activeThread?.msgs ?? []

  function selectThread(phone: string) {
    setSelectedPhone(phone)
    setMobileView('conversation')
  }

  const statsBarItems = [
    { value: stats.total, label: 'Sent this month' },
    { value: stats.delivered, label: 'Delivered', color: 'var(--tw-color-green, #35c98a)' },
    { value: stats.pending, label: 'Pending', color: 'rgba(255,255,255,0.55)' },
    { value: `${stats.deliveryRate}%`, label: 'Delivery rate' },
    { value: `${used} / ${cap}`, label: 'Quota used' },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Stats bar */}
      <StatsBar
        stats={statsBarItems}
        className="shrink-0"
      />

      {/* Filters row */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-bg px-6 py-3">
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="rounded-[9px] border border-line bg-card px-3 py-2 font-[inherit] text-[13px] text-text outline-none"
        >
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <div className="flex flex-wrap gap-1.5">
          {BUCKETS.map(b => (
            <button
              key={b}
              onClick={() => setBucket(b)}
              className={[
                'rounded-[9px] border px-3 py-2 text-[12.5px] font-semibold transition',
                bucket === b
                  ? 'border-orange bg-orange text-white'
                  : 'border-line bg-card text-dim hover:bg-card-2',
              ].join(' ')}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* 3-column body */}
      <div className="grid min-h-0 flex-1 overflow-hidden" style={{ gridTemplateColumns: '320px 1fr 320px' }}>
        {/* LEFT: Thread list */}
        <div
          className={[
            'flex flex-col overflow-hidden border-r border-line',
            // On mobile: show only when in threads view
            mobileView === 'threads' ? 'flex' : 'hidden',
            'md:flex',
          ].join(' ')}
        >
          {/* Thread list header */}
          <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3.5">
            <h2 className="text-[13.5px] font-bold tracking-[-0.2px] text-text">Conversations</h2>
            {threads.length > 0 && (
              <span className="text-[11px] text-faint">{threads.length} thread{threads.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Thread list body */}
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
            {threads.length === 0 && (
              <div className="px-4 py-10 text-center">
                <div className="mb-3 text-3xl">💬</div>
                <p className="text-[13px] text-dim">No messages this month.</p>
                <p className="mt-1 text-[11.5px] text-faint">TalkMate will auto-send confirmations, reminders, and follow-ups as your agent handles calls.</p>
              </div>
            )}
            {threads.map(thread => {
              const isSel = thread.phone === activePhone
              const status = clientSmsStatus(thread.latest.status)
              return (
                <button
                  key={thread.phone}
                  onClick={() => selectThread(thread.phone)}
                  className={[
                    'flex w-full cursor-pointer gap-2.5 border-b border-line px-4 py-3 text-left transition-colors',
                    isSel
                      ? 'border-l-[3px] border-l-orange bg-[rgba(238,106,44,.07)]'
                      : 'hover:bg-[rgba(255,255,255,.025)]',
                  ].join(' ')}
                  style={isSel ? { paddingLeft: 13 } : undefined}
                >
                  {/* Avatar */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,#2a4a6a,#1a3350)] text-[12px] font-bold text-[#7fb0d5]">
                    {initials(thread.phone)}
                  </div>
                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px] font-bold text-text">
                        {formatAuPhone(thread.phone)}
                      </span>
                      <span className="ml-1.5 shrink-0 text-[11px] text-faint">
                        {formatDate(thread.latest.sent_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-dim">
                        {thread.latest.message.length > 60
                          ? thread.latest.message.slice(0, 60) + '…'
                          : thread.latest.message}
                      </span>
                      {/* Unread dot for pending */}
                      {thread.latest.status !== 'sent' && (
                        <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-orange" />
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* CENTER: Conversation pane */}
        <div
          className={[
            'flex flex-col overflow-hidden',
            mobileView === 'conversation' ? 'flex' : 'hidden',
            'md:flex',
          ].join(' ')}
        >
          {activeThread ? (
            <>
              {/* Conversation header */}
              <div className="flex shrink-0 items-center gap-3 border-b border-line px-[22px] py-4">
                {/* Mobile back button */}
                <button
                  className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-line bg-card text-dim md:hidden"
                  onClick={() => setMobileView('threads')}
                  aria-label="Back to threads"
                >
                  ←
                </button>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-[linear-gradient(135deg,#2a4a6a,#1a3350)] text-[14px] font-bold text-[#7fb0d5]">
                  {initials(activeThread.phone)}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-[800] tracking-[-0.2px] text-text">
                    {formatAuPhone(activeThread.phone)}
                  </h2>
                  <p className="mt-0.5 text-[12px] text-dim">
                    {activeMessages.length} message{activeMessages.length !== 1 ? 's' : ''} · last {formatTime(activeThread.latest.sent_at)}
                  </p>
                </div>
              </div>

              {/* Message bubbles */}
              <div
                className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-[22px] py-[18px]"
                style={{ scrollbarWidth: 'none' }}
              >
                {/* Messages are sorted newest-first in thread, reverse for display */}
                {[...activeMessages].reverse().map(msg => {
                  const status = clientSmsStatus(msg.status)
                  const typeLabel = getSmsLabel(msg.sms_type)
                  const typeCls = smsTypeClass(msg.sms_type)
                  return (
                    <div key={msg.id} className="flex max-w-[72%] flex-col self-end items-end">
                      {/* Message bubble — outbound only (TalkMate sends, not receives) */}
                      <div className="rounded-[12px] rounded-br-[3px] bg-[linear-gradient(135deg,#f58a42,#e86526)] px-[14px] py-[10px] text-[13px] leading-[1.5] text-white">
                        {msg.message}
                      </div>
                      {/* Meta row */}
                      <div className="mt-1 flex items-center gap-1.5">
                        {/* Type tag */}
                        <span className={['rounded-[5px] px-[6px] py-[1px] text-[9.5px] font-[700] uppercase tracking-[.06em]', typeCls].join(' ')}>
                          {typeLabel}
                        </span>
                        {/* Time */}
                        <span className="text-[10.5px] text-faint">
                          {formatDateTime(msg.sent_at)}
                        </span>
                        {/* Status dot */}
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: status.color }}
                          title={status.label}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Compose bar (read-only indicator — TalkMate sends automatically) */}
              <div className="flex shrink-0 items-center gap-2 border-t border-line px-[22px] py-3.5">
                <div className="flex-1 rounded-[10px] border border-line bg-card px-[14px] py-2.5 text-[13px] text-faint">
                  TalkMate sends messages automatically based on your AI receptionist settings.
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <div className="text-4xl">💬</div>
              <p className="text-[14px] text-dim">Select a conversation to view messages</p>
            </div>
          )}
        </div>

        {/* RIGHT: Templates panel */}
        <div
          className="overflow-y-auto border-l border-line bg-[var(--sidebar,#0c1a2b)] p-[18px]"
          style={{ scrollbarWidth: 'none' }}
        >
          <h2 className="mb-3.5 text-[13.5px] font-[800] tracking-[-0.2px] text-text">SMS Templates</h2>
          <p className="mb-4 text-[12px] text-faint leading-[1.5]">
            These templates are sent automatically by your AI receptionist. They are shown here for reference.
          </p>
          <div className="flex flex-col gap-2.5">
            {SMS_TEMPLATES.map((tpl, i) => (
              <div
                key={i}
                className="cursor-default rounded-[11px] border border-line bg-card p-[13px] shadow-[0_1px_4px_rgba(0,0,0,.28)] transition-colors hover:border-[rgba(238,106,44,.3)]"
              >
                <div className={['mb-1.5 text-[9.5px] font-[700] uppercase tracking-[.08em]', tpl.typeClass].join(' ')}>
                  {tpl.typeLabel}
                </div>
                <div className="mb-1 text-[13px] font-bold text-text">{tpl.name}</div>
                <div className="text-[11.5px] leading-[1.5] text-dim">{tpl.preview}</div>
                <div className="mt-2 text-[11.5px] font-[700] text-orange">
                  Sent automatically →
                </div>
              </div>
            ))}
          </div>

          {/* Usage meter */}
          <div className="mt-5 rounded-[11px] border border-line bg-card p-[13px] shadow-[0_1px_4px_rgba(0,0,0,.28)]">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[.07em] text-faint">Monthly quota</div>
            <div className="mb-1.5 text-[20px] font-[800] tabular-nums tracking-[-0.5px] text-text">
              {used} <span className="text-[13px] font-normal text-faint">/ {cap}</span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 overflow-hidden rounded-full bg-line-strong">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, cap > 0 ? Math.round((used / cap) * 100) : 0)}%`,
                  background: used / cap > 0.85
                    ? '#f0625a'
                    : used / cap > 0.6
                      ? '#f2b53c'
                      : '#35c98a',
                }}
              />
            </div>
            <div className="mt-1 text-[11px] text-faint">messages used this month</div>
          </div>
        </div>
      </div>
    </div>
  )
}
