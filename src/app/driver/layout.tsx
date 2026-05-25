import type { Metadata, Viewport } from 'next'

// Sessions 36-37 — driver-app metadata. Mobile-first viewport, themed
// status bar, and a PWA manifest pointing at /driver/manifest.json so
// drivers can "Add to Home Screen" on iOS / Android. The service
// worker (/driver/sw.js) is registered client-side by PushRegister.

export const metadata: Metadata = {
  title: {
    template: '%s — TalkMate Driver',
    default: 'TalkMate Driver',
  },
  manifest: '/driver/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'TalkMate Driver',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#061322',
}

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return children
}
