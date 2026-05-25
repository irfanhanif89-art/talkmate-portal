import type { Metadata, Viewport } from 'next'

// Sessions 36-37 — driver-app metadata. Mobile-first viewport, themed
// status bar so the PWA install in Phase 5 picks up the brand colour.

export const metadata: Metadata = {
  title: {
    template: '%s — TalkMate Driver',
    default: 'TalkMate Driver',
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
