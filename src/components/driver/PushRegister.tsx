'use client'

// Sessions 36-37 — registers the /driver/sw.js service worker and
// subscribes to Web Push the first time the driver opens the app
// after going online. Permission prompts are gated to a single
// "Enable notifications" tap so we don't ambush the user with a
// browser prompt on every dashboard visit.

import { useEffect, useState } from 'react'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function PushRegister() {
  const [supported, setSupported] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ok = 'serviceWorker' in navigator && 'PushManager' in window
    setSupported(ok)
    if (!ok) return

    setPermission(Notification.permission)
    setHidden(localStorage.getItem('driver-push-dismissed') === '1')

    navigator.serviceWorker
      .register('/driver/sw.js', { scope: '/driver/' })
      .then(async (reg) => {
        const existing = await reg.pushManager.getSubscription()
        if (existing) setRegistered(true)
      })
      .catch((e) => console.error('[push] sw register failed', e))
  }, [])

  async function enable() {
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') return

      const reg = await navigator.serviceWorker.ready
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!publicKey) {
        console.error('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set')
        return
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast: TS lib.dom narrows BufferSource to ArrayBuffer-only,
        // but PushManager accepts a Uint8Array at runtime per spec.
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as ArrayBuffer,
      })
      await fetch('/api/driver/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      setRegistered(true)
    } catch (e) {
      console.error('[push] subscribe failed', e)
    } finally {
      setBusy(false)
    }
  }

  function dismiss() {
    localStorage.setItem('driver-push-dismissed', '1')
    setHidden(true)
  }

  if (!supported || registered || permission === 'denied' || hidden) return null

  return (
    <div style={{
      background: '#fff7ed',
      border: '1px solid #fed7aa',
      color: '#9a3412',
      padding: '12px 14px',
      borderRadius: 10,
      fontSize: 14,
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{ flex: 1 }}>
        <strong>Get push notifications</strong> the second a new job is offered to you.
      </div>
      <button
        onClick={enable}
        disabled={busy}
        style={{
          background: '#E8622A',
          color: '#fff',
          border: 'none',
          padding: '8px 14px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          cursor: busy ? 'wait' : 'pointer',
          fontFamily: 'inherit',
        }}
      >{busy ? '…' : 'Enable'}</button>
      <button
        onClick={dismiss}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#9a3412',
          fontSize: 18,
          cursor: 'pointer',
          padding: 4,
        }}
        aria-label="Dismiss"
      >×</button>
    </div>
  )
}
