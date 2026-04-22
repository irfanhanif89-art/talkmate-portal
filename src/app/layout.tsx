import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TalkMate Portal — AI Voice Agent Dashboard',
  description: 'Manage your TalkMate AI voice agent. View calls, update settings, and grow your business.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}
