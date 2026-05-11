import type { Metadata } from 'next'
import SignupClient from './signup-client'

export const metadata: Metadata = {
  title: 'Start your TalkMate trial',
  description: 'Pick a plan, sign up, and get your AI receptionist live in 24 hours. No credit card required for the free trial.',
}

// Public, intentionally lives at /signup (root) — outside the (portal)
// auth-gated route group so unauthenticated visitors land here without
// being redirected to /login.
//
// Next 16 hands `searchParams` to page components as a Promise.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>
}) {
  const { plan } = await searchParams
  const planParam = (plan ?? '').toLowerCase()
  const initialPlan: 'starter' | 'growth' | 'pro' =
    planParam === 'starter' ? 'starter'
    : planParam === 'pro' || planParam === 'professional' ? 'pro'
    : 'growth' // default to Growth — the "most popular" plan

  return <SignupClient initialPlan={initialPlan} />
}
