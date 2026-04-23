'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Partner {
  id: string
  referral_slug: string
  referral_link: string
  stripe_account_id: string | null
  stripe_onboarding_complete: boolean
  bank_verified: boolean
  tier: 'starter' | 'silver' | 'gold'
  tier_rate: number
  total_referrals: number
  active_referrals: number
  pending_payout: number
  total_earned: number
  last_paid_at: string | null
  last_paid_amount: number | null
  payout_status: string
  joined_at: string
}

interface Referral {
  id: string
  referred_business_name: string
  plan_name: string
  subscription_amount: number
  status: 'pending' | 'active' | 'churned'
  monthly_earning: number
  created_at: string
  activated_at: string | null
}

interface LeaderboardEntry {
  id: string
  referral_slug: string
  active_referrals: number
  pending_payout: number
  tier: string
}

const TIER_CONFIG = {
  starter: { label: 'Starter Partner', range: '1–2 active referrals', rate: '15%', color: '#4A9FE8', next: 'Silver', nextCount: 3 },
  silver: { label: 'Silver Partner', range: '3–9 active referrals', rate: '20%', color: '#9CA3AF', next: 'Gold', nextCount: 10 },
  gold: { label: 'Gold Partner', range: '10+ active referrals', rate: '25%', color: '#F59E0B', next: null, nextCount: null },
}

const TIERS = [
  { key: 'starter', label: 'Starter Partner', range: '1–2 active referrals', rate: '15%', color: '#4A9FE8' },
  { key: 'silver', label: 'Silver Partner', range: '3–9 active referrals', rate: '20%', color: '#9CA3AF' },
  { key: 'gold', label: 'Gold Partner', range: '10+ active referrals', rate: '25%', color: '#F59E0B' },
]

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    active: { bg: 'rgba(34,197,94,0.12)', color: '#22C55E', label: 'Active' },
    pending: { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B', label: 'Pending' },
    churned: { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'Churned' },
  }
  const s = map[status] || map.pending
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

export default function ReferAndEarnPage() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [partner, setPartner] = useState<Partner | null>(null)
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedMsg, setCopiedMsg] = useState(false)
  const [toast, setToast] = useState('')

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/partners/me')
    const data = await res.json()
    if (data.partner) {
      setPartner(data.partner)
      setReferrals(data.referrals)
      setLeaderboard(data.leaderboard)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const stripe = searchParams.get('stripe')
    if (stripe === 'complete') {
      setToast('Bank account connected! Payouts are now active.')
      fetchData()
    } else if (stripe === 'refresh') {
      setToast('Stripe session expired. Please try connecting again.')
    }
  }, [searchParams, fetchData])

  async function joinProgram() {
    setJoining(true)
    const res = await fetch('/api/partners/register', { method: 'POST' })
    if (res.ok) {
      await fetchData()
    } else {
      setToast('Failed to join. Please try again.')
    }
    setJoining(false)
  }

  async function connectStripe() {
    setConnecting(true)
    const res = await fetch('/api/partners/connect-stripe', { method: 'POST' })
    const data = await res.json()
    if (data.url) {
      window.location.href = data.url
    } else {
      setToast('Failed to connect Stripe. Please try again.')
      setConnecting(false)
    }
  }

  function copyLink() {
    if (!partner) return
    navigator.clipboard.writeText(partner.referral_link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function copyMessage() {
    if (!partner) return
    const msg = `Hey! I use TalkMate for my business — it answers every call with AI 24/7. Highly recommend it. Sign up here and they'll be in touch: ${partner.referral_link}`
    navigator.clipboard.writeText(msg)
    setCopiedMsg(true)
    setTimeout(() => setCopiedMsg(false), 2000)
  }

  function shareVia(method: 'sms' | 'whatsapp' | 'email') {
    if (!partner) return
    const msg = encodeURIComponent(`Hey! I use TalkMate for my business — it answers every call with AI 24/7. Sign up here: ${partner.referral_link}`)
    if (method === 'sms') window.open(`sms:?body=${msg}`)
    if (method === 'whatsapp') window.open(`https://wa.me/?text=${msg}`)
    if (method === 'email') window.open(`mailto:?subject=${encodeURIComponent('You need TalkMate for your business')}&body=${msg}`)
  }

  const tier = partner ? TIER_CONFIG[partner.tier] : TIER_CONFIG.starter
  const nextTierDiff = partner && tier.nextCount ? tier.nextCount - partner.active_referrals : null
  const perClientExtra = partner ? (partner.pending_payout / Math.max(partner.active_referrals, 1)) * (tier.nextCount ? 1 : 0) : 0

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#4A7FBB', fontSize: 14 }}>
        Loading…
      </div>
    )
  }

  // Not yet a partner — show join screen
  if (!partner) {
    return (
      <div style={{ padding: 32, maxWidth: 680, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#E8622A', marginBottom: 8 }}>Refer & Earn</div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'white', letterSpacing: '-0.5px', marginBottom: 12 }}>Earn monthly income sharing TalkMate</h1>
          <p style={{ fontSize: 15, color: '#4A7FBB', lineHeight: 1.7 }}>For every business you refer, earn 15% of their monthly subscription — every single month they stay. Plus a $100 bonus when each referral completes their first month.</p>
        </div>

        {/* How it works */}
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 28, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 20 }}>How it works</div>
          {[
            { n: '1', title: 'Share your link', body: 'Send via SMS, WhatsApp, or email. We write the message for you.' },
            { n: '2', title: 'They sign up & go live', body: 'Your referral completes their first full billing month with 10+ calls.' },
            { n: '3', title: 'You get $100 bonus', body: 'Paid within 48 hours of their first full month completing.' },
            { n: '4', title: 'You earn 15% every month', body: 'For as long as they stay a TalkMate client. No cap, no expiry.' },
          ].map(s => (
            <div key={s.n} style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(232,98,42,0.15)', border: '1px solid rgba(232,98,42,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#E8622A', flexShrink: 0 }}>{s.n}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 2 }}>{s.title}</div>
                <div style={{ fontSize: 13, color: '#4A7FBB', fontWeight: 300 }}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tier preview */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 28 }}>
          {TIERS.map(t => (
            <div key={t.key} style={{ background: '#0A1E38', border: `1px solid ${t.key === 'starter' ? 'rgba(74,159,232,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 12, padding: '16px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: t.color, marginBottom: 4 }}>{t.rate}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'white', marginBottom: 4 }}>{t.label}</div>
              <div style={{ fontSize: 11, color: '#4A7FBB' }}>{t.range}</div>
            </div>
          ))}
        </div>

        <button onClick={joinProgram} disabled={joining} style={{ width: '100%', padding: '16px', background: '#E8622A', color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'Outfit,sans-serif' }}>
          {joining ? 'Joining…' : 'Join the Partner Program →'}
        </button>
        <p style={{ fontSize: 12, color: '#4A7FBB', textAlign: 'center', marginTop: 10 }}>Free to join. Paid on the 1st of every month via bank transfer.</p>
      </div>
    )
  }

  // Active partner dashboard
  return (
    <div style={{ padding: 32, maxWidth: 860, margin: '0 auto' }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, background: '#22C55E', color: 'white', borderRadius: 10, padding: '12px 20px', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit,sans-serif', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
          onClick={() => setToast('')}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#E8622A', marginBottom: 6 }}>Refer & Earn</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', letterSpacing: '-0.5px', margin: 0 }}>Partner Program</h1>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 99, background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>● Active</span>
        </div>
        <p style={{ fontSize: 13, color: '#4A7FBB', marginTop: 6 }}>Earn monthly income just by sharing TalkMate. For every business you refer, earn 15% of their monthly subscription — every single month they stay.</p>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ height: 2, background: 'linear-gradient(90deg, #E8622A, #1565C0)' }} />
          <div style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4A7FBB', marginBottom: 8 }}>Earned this month</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#E8622A', letterSpacing: '-1px' }}>${(partner.pending_payout).toFixed(2)}</div>
          </div>
        </div>
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ height: 2, background: 'linear-gradient(90deg, #22C55E, #1565C0)' }} />
          <div style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4A7FBB', marginBottom: 8 }}>Active referrals</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'white', letterSpacing: '-1px' }}>{partner.active_referrals}</div>
          </div>
        </div>
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ height: 2, background: 'linear-gradient(90deg, #4A9FE8, #1565C0)' }} />
          <div style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#4A7FBB', marginBottom: 8 }}>Total earned to date</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'white', letterSpacing: '-1px' }}>${(partner.total_earned).toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Next payout */}
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4A7FBB', marginBottom: 12 }}>Next payout</div>
          <p style={{ fontSize: 12, color: '#4A7FBB', marginBottom: 12 }}>Paid automatically on the 1st of every month via bank transfer</p>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'white', marginBottom: 4 }}>${partner.pending_payout.toFixed(2)}</div>
          <div style={{ fontSize: 12, color: '#22C55E', marginBottom: 20 }}>
            Scheduled · 1 {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
          </div>
          {!partner.stripe_onboarding_complete ? (
            <button onClick={connectStripe} disabled={connecting} style={{ width: '100%', padding: '11px', background: '#E8622A', color: 'white', border: 'none', borderRadius: 10, fontFamily: 'Outfit,sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              {connecting ? 'Redirecting to Stripe…' : 'Connect bank account →'}
            </button>
          ) : (
            <button onClick={connectStripe} disabled={connecting} style={{ width: '100%', padding: '11px', background: 'transparent', border: '1px solid rgba(74,159,232,0.3)', color: '#4A9FE8', borderRadius: 10, fontFamily: 'Outfit,sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              {connecting ? 'Loading…' : 'Update bank details'}
            </button>
          )}
        </div>

        {/* Referral link */}
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4A7FBB', marginBottom: 12 }}>Your unique referral link</div>
          <p style={{ fontSize: 12, color: '#4A7FBB', marginBottom: 12 }}>Share this link — when someone signs up through it, you earn automatically</p>
          <div style={{ background: '#071829', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '11px 14px', fontSize: 13, color: 'white', marginBottom: 14, wordBreak: 'break-all', fontFamily: 'monospace' }}>
            {partner.referral_link}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <button onClick={copyLink} style={{ padding: '9px', background: '#E8622A', color: 'white', border: 'none', borderRadius: 8, fontFamily: 'Outfit,sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {copied ? '✓ Copied!' : 'Copy link'}
            </button>
            <button onClick={() => shareVia('sms')} style={{ padding: '9px', background: 'transparent', border: '1px solid rgba(74,159,232,0.3)', color: '#4A9FE8', borderRadius: 8, fontFamily: 'Outfit,sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>SMS</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <button onClick={() => shareVia('whatsapp')} style={{ padding: '9px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#7BAED4', borderRadius: 8, fontFamily: 'Outfit,sans-serif', fontSize: 12, cursor: 'pointer' }}>WhatsApp</button>
            <button onClick={() => shareVia('email')} style={{ padding: '9px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#7BAED4', borderRadius: 8, fontFamily: 'Outfit,sans-serif', fontSize: 12, cursor: 'pointer' }}>Email</button>
            <button onClick={copyMessage} style={{ padding: '9px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: copiedMsg ? '#22C55E' : '#7BAED4', borderRadius: 8, fontFamily: 'Outfit,sans-serif', fontSize: 12, cursor: 'pointer' }}>
              {copiedMsg ? '✓ Copied' : 'Copy msg'}
            </button>
          </div>
        </div>
      </div>

      {/* Tier progress */}
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 20 }}>Your earnings tier</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: tier.next ? 16 : 0 }}>
          {TIERS.map(t => {
            const isActive = partner.tier === t.key
            return (
              <div key={t.key} style={{ border: `1.5px solid ${isActive ? t.color : 'rgba(255,255,255,0.07)'}`, borderRadius: 12, padding: '14px 16px', background: isActive ? `rgba(${t.key === 'gold' ? '245,158,11' : t.key === 'silver' ? '156,163,175' : '74,159,232'},0.06)` : 'transparent', position: 'relative' }}>
                {isActive && <div style={{ position: 'absolute', top: -10, left: 12, background: t.color, color: '#061322', fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 99 }}>YOU ARE HERE</div>}
                <div style={{ fontSize: 20, fontWeight: 800, color: t.color, marginBottom: 4 }}>{t.rate}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'white', marginBottom: 3 }}>{t.label}</div>
                <div style={{ fontSize: 11, color: '#4A7FBB' }}>{t.range}</div>
              </div>
            )
          })}
        </div>
        {tier.next && nextTierDiff !== null && nextTierDiff > 0 && (
          <div style={{ background: 'rgba(74,159,232,0.06)', border: '1px solid rgba(74,159,232,0.15)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#4A9FE8' }}>
            <strong>{nextTierDiff} more referral{nextTierDiff > 1 ? 's' : ''}</strong> until {tier.next} ({TIERS.find(t => t.label.toLowerCase().startsWith(tier.next!.toLowerCase()))?.rate}) — that&apos;s extra recurring income every month
          </div>
        )}
      </div>

      {/* Referrals table */}
      <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Your referrals</div>
          <div style={{ fontSize: 12, color: '#4A7FBB' }}>{partner.active_referrals} active · ${partner.pending_payout.toFixed(2)}/month recurring</div>
        </div>

        {referrals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔗</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'white', marginBottom: 6 }}>No referrals yet</div>
            <div style={{ fontSize: 13, color: '#4A7FBB' }}>Share your link above and start earning</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 100px 120px 100px', padding: '10px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              {['Business', 'Plan', 'Status', 'Your earnings', 'Since'].map(h => (
                <div key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#4A7FBB' }}>{h}</div>
              ))}
            </div>
            {referrals.map((r, i) => (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 100px 120px 100px', padding: '14px 24px', borderBottom: i < referrals.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>{r.referred_business_name || 'Unknown'}</div>
                <div style={{ fontSize: 13, color: '#7BAED4' }}>{r.plan_name} · ${r.subscription_amount}/mo</div>
                <div><StatusBadge status={r.status} /></div>
                <div style={{ fontSize: 13, fontWeight: 700, color: r.status === 'active' ? '#22C55E' : '#4A7FBB' }}>
                  {r.status === 'active' ? `$${r.monthly_earning.toFixed(2)}/mo` : `$${r.monthly_earning.toFixed(2)}/mo soon`}
                </div>
                <div style={{ fontSize: 12, color: '#4A7FBB' }}>
                  {new Date(r.created_at).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div style={{ background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Partner leaderboard — {new Date().toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</div>
            <div style={{ fontSize: 12, color: '#4A7FBB', marginTop: 2 }}>Top earners this month</div>
          </div>
          {leaderboard.map((entry, i) => {
            const isMe = entry.id === partner.id
            const tierInfo = TIERS.find(t => t.key === entry.tier)
            const medals = ['🥇', '🥈', '🥉']
            return (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 24px', borderBottom: i < leaderboard.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: isMe ? 'rgba(232,98,42,0.05)' : 'transparent' }}>
                <div style={{ fontSize: i < 3 ? 18 : 13, width: 28, textAlign: 'center', fontWeight: 800, color: i < 3 ? 'white' : '#4A7FBB', flexShrink: 0 }}>
                  {i < 3 ? medals[i] : `${i + 1}`}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: isMe ? 700 : 600, color: isMe ? '#E8622A' : 'white' }}>
                    {isMe ? 'You' : entry.referral_slug}
                    {isMe && <span style={{ fontSize: 10, marginLeft: 8, color: '#E8622A' }}>← You</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#4A7FBB' }}>{entry.active_referrals} referrals · {tierInfo?.label}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: isMe ? '#E8622A' : 'white' }}>
                  ${entry.pending_payout.toFixed(2)}/mo
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
