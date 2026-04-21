'use client'

import { useState } from 'react'

const upsells = [
  { emoji: '⭐', title: 'Google Review Requests', desc: 'After every positive call, your AI automatically SMS the customer asking for a Google review. More 5-star reviews = more customers finding you.', price: '+$49', popular: true },
  { emoji: '💬', title: 'SMS Follow-Ups', desc: 'Automatically follow up missed calls, enquiry no-responses, or appointment no-shows with a personalised SMS. Never lose a lead again.', price: '+$39', popular: false },
  { emoji: '📤', title: 'Outbound AI Calls', desc: 'Your AI proactively calls leads, confirms bookings, and chases quotes so you don\'t have to. Works 24/7 while you sleep.', price: '+$79', popular: false },
]

const invoices = [
  { date: '21 Apr 2026', desc: 'Talkmate Starter — April 2026', amount: '$299.00', status: 'Paid' },
  { date: '21 Apr 2026', desc: 'Implementation Fee', amount: '$299.00', status: 'Paid' },
]

const inp = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: 10, padding: '11px 14px', width: '100%', fontFamily: 'Outfit,sans-serif', fontSize: 14, outline: 'none' } as React.CSSProperties

export default function BillingPage() {
  const [cancelling, setCancelling] = useState(false)

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white' }}>Billing</h1>
      </div>

      {/* Plan + Usage */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
        <div style={{ background: 'linear-gradient(135deg,rgba(232,98,42,0.1),rgba(10,30,56,1))', border: '1px solid rgba(232,98,42,0.3)', borderRadius: 16, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: '#4A7FBB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Current Plan</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'white' }}>Starter</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 99, background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>Active</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginBottom: 4 }}>$299<span style={{ fontSize: 14, fontWeight: 400, color: '#4A7FBB' }}>/month</span></div>
          <div style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 20 }}>Next billing: 21 May 2026</div>
          <button onClick={async () => { const r = await fetch('/api/stripe/portal', { method: 'POST' }); const d = await r.json(); if (d.url) window.location.href = d.url }}
            style={{ width: '100%', padding: '11px', background: 'transparent', border: '1px solid rgba(74,159,232,0.3)', color: '#4A9FE8', borderRadius: 10, fontFamily: 'Outfit,sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Manage Payment Method
          </button>
        </div>

        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: 11, color: '#4A7FBB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Usage This Month</div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: 'white' }}>AI Calls Used</span>
              <span style={{ fontWeight: 700, color: 'white' }}>247 <span style={{ color: '#4A7FBB' }}>/ 500</span></span>
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: '49%', height: '100%', background: '#22c55e', borderRadius: 4 }} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: 'white' }}>SMS Sent</span>
              <span style={{ fontWeight: 700, color: 'white' }}>0 <span style={{ color: '#4A7FBB' }}>/ 0</span></span>
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4 }} />
          </div>
          <div style={{ fontSize: 12, color: '#4A7FBB', padding: 10, background: '#071829', borderRadius: 8 }}>
            💡 At this rate you&apos;ll use ~60% of your monthly calls.
          </div>
        </div>
      </div>

      {/* Upsells */}
      <div style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 16 }}>💡 Grow your business with these add-ons</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 28 }}>
        {upsells.map(u => (
          <div key={u.title} style={{ background: '#0A1E38', border: `1px solid ${u.popular ? 'rgba(232,98,42,0.3)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 16, padding: 24, position: 'relative', overflow: 'hidden' }}>
            {u.popular && <div style={{ position: 'absolute', top: 12, right: 12, background: '#E8622A', color: 'white', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99 }}>MOST POPULAR</div>}
            <div style={{ fontSize: 28, marginBottom: 10 }}>{u.emoji}</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'white', marginBottom: 8 }}>{u.title}</div>
            <div style={{ fontSize: 13, color: '#4A7FBB', marginBottom: 16, lineHeight: 1.6 }}>{u.desc}</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'white', marginBottom: 14 }}>{u.price}<span style={{ fontSize: 13, fontWeight: 400, color: '#4A7FBB' }}>/mo</span></div>
            <button style={{ width: '100%', padding: '10px', background: u.popular ? '#E8622A' : 'transparent', color: u.popular ? 'white' : '#4A9FE8', border: u.popular ? 'none' : '1px solid rgba(74,159,232,0.3)', borderRadius: 10, fontFamily: 'Outfit,sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Upgrade to unlock →
            </button>
          </div>
        ))}
      </div>

      {/* Invoices */}
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginBottom: 16 }}>🧾 Invoices</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#4A7FBB' }}>
              {['Date', 'Description', 'Amount', 'Status', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv, i) => (
              <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 14, color: 'white' }}>
                <td style={{ padding: '14px 0', color: '#4A7FBB' }}>{inv.date}</td>
                <td style={{ padding: '14px 0' }}>{inv.desc}</td>
                <td style={{ padding: '14px 0', fontWeight: 600 }}>{inv.amount}</td>
                <td style={{ padding: '14px 0' }}><span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>Paid</span></td>
                <td style={{ padding: '14px 0', textAlign: 'right' }}><a href="#" style={{ color: '#4A9FE8', fontSize: 13, textDecoration: 'none' }}>Download PDF</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cancel */}
      <div style={{ textAlign: 'center' }}>
        <button onClick={() => setCancelling(!cancelling)} style={{ background: 'transparent', border: 'none', color: '#4A7FBB', fontSize: 13, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}>
          Cancel subscription
        </button>
        {cancelling && (
          <div style={{ marginTop: 16, padding: 20, background: '#0A1E38', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 14, maxWidth: 400, margin: '16px auto 0' }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: 'white' }}>Before you go...</div>
            <div style={{ fontSize: 13, color: '#7BAED4', marginBottom: 16 }}>Use code <strong style={{ color: '#E8622A' }}>STAY20</strong> for 20% off your next 3 months.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ flex: 1, padding: 10, background: '#E8622A', color: 'white', border: 'none', borderRadius: 8, fontFamily: 'Outfit,sans-serif', fontWeight: 600, cursor: 'pointer' }}>Apply Discount</button>
              <button onClick={() => setCancelling(false)} style={{ flex: 1, padding: 10, background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontFamily: 'Outfit,sans-serif', cursor: 'pointer' }}>Cancel Anyway</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
