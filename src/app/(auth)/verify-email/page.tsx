'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') ?? ''

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', background: '#061322' }}>
      <div style={{ width: '100%', maxWidth: '480px', padding: '48px 40px', borderRadius: '16px', border: '1px solid rgba(232,98,42,0.2)', background: '#0A1E38', textAlign: 'center' }}>

        {/* Logo */}
        <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'center' }}>
          <svg width="160" height="48" viewBox="0 0 400 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="120" height="120" rx="22" fill="#E8622A"/>
            <rect x="18" y="20" width="84" height="18" fill="white"/>
            <rect x="51" y="20" width="18" height="62" fill="white"/>
            <path d="M 108 78 A 30 30 0 0 0 78 108" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.3"/>
            <path d="M 108 88 A 20 20 0 0 0 88 108" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>
            <path d="M 108 98 A 10 10 0 0 0 98 108" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
            <circle cx="108" cy="108" r="4.5" fill="white"/>
            <rect x="140" y="16" width="1.5" height="88" fill="#E8622A" opacity="0.45"/>
            <text x="158" y="78" fontFamily="'Outfit', sans-serif" fontSize="52" fontWeight="800" fill="white" letterSpacing="-2">Talk</text>
            <text x="160" y="108" fontFamily="'Outfit', sans-serif" fontSize="26" fontWeight="300" fill="#4A9FE8" letterSpacing="4">Mate</text>
          </svg>
        </div>

        {/* Email icon */}
        <div style={{ fontSize: '56px', marginBottom: '24px', lineHeight: 1 }}>📧</div>

        <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'white', marginBottom: '16px' }}>
          Verify your email address
        </h1>

        <p style={{ fontSize: '15px', color: '#4A7FBB', lineHeight: '1.6', marginBottom: '32px' }}>
          We sent a verification link to{' '}
          <strong style={{ color: 'white' }}>{email}</strong>.
          {' '}Click the link in your email to activate your account, then come back to log in.
        </p>

        <a
          href="/login"
          style={{
            display: 'inline-block',
            width: '100%',
            padding: '12px 24px',
            background: '#E8622A',
            color: 'white',
            borderRadius: '8px',
            fontWeight: '600',
            fontSize: '15px',
            textDecoration: 'none',
            boxSizing: 'border-box',
          }}
        >
          Go to Login →
        </a>

        <p style={{ fontSize: '13px', color: '#4A7FBB', marginTop: '20px' }}>
          Didn&apos;t get the email? Check your spam folder or contact{' '}
          <a href="mailto:hello@talkmate.com.au" style={{ color: '#4A9FE8', textDecoration: 'none' }}>
            hello@talkmate.com.au
          </a>.
        </p>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  )
}
