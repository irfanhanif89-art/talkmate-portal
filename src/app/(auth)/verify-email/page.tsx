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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-lockup-dark.svg" alt="TalkMate" style={{ height: 48, width: 'auto', display: 'block' }} />
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
