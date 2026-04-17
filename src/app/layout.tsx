import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Talkmate Portal',
  description: 'AI voice agent portal for every business',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
