'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import LegalAcceptanceForm from '@/components/portal/legal-acceptance-form'
import { createClient } from '@/lib/supabase/client'
import type { DocumentType, LegalDoc } from '@/lib/legal-docs'

export default function AcceptTermsClient({ docs, businessName, nextUrl }: {
  docs: LegalDoc[]
  businessName: string
  nextUrl: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(signature: string, acceptedDocs: DocumentType[]) {
    setBusy(true); setError(null)
    try {
      // Refresh the session first — prevents 401 if the token expired
      // while the user was reading the T&Cs
      const supabase = createClient()
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) {
        // Session is gone — send them to login and bring them back here after
        router.push('/login?next=%2Faccept-terms')
        return
      }
      // Force-refresh the access token so the cookie is fresh
      await supabase.auth.refreshSession()

      const res = await fetch('/api/legal/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature, acceptedDocs }),
      })
      const data = await res.json()
      if (!data.ok) {
        // If still unauthorized after refresh, session is truly gone
        if (res.status === 401) {
          router.push('/login?next=%2Faccept-terms')
          return
        }
        setError(data.error || 'Could not record acceptance.')
        setBusy(false)
        return
      }
      router.push(nextUrl)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#061322', display: 'flex', justifyContent: 'center', padding: '48px 20px' }}>
      <div style={{ width: '100%', maxWidth: 720 }}>
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#E8622A', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 8 }}>Action required</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>
            Updated terms for {businessName}
          </h1>
          <p style={{ fontSize: 14, color: '#7BAED4', marginTop: 10, lineHeight: 1.6 }}>
            We&apos;ve updated our Terms of Service and Privacy Policy. Please review and accept to continue using TalkMate.
          </p>
        </div>

        <div style={{ background: '#0A1E38', border: '1px solid rgba(232,98,42,0.2)', borderRadius: 18, padding: 28 }}>
          <LegalAcceptanceForm docs={docs} busy={busy} onSubmit={submit} showHeader={false} />
          {error && (
            <div style={{ marginTop: 14, fontSize: 13, color: '#EF4444', textAlign: 'center' }}>{error}</div>
          )}
        </div>
      </div>
    </div>
  )
}
