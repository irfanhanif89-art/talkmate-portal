import type { Metadata } from 'next'
import './globals.css'
import { dmSans, dmMono } from './fonts'
import { ThemeProvider } from '@/components/theme-provider'

export const metadata: Metadata = {
  title: { template: '%s — TalkMate', default: 'TalkMate Portal — AI Voice Agent Dashboard' },
  description: 'Manage your TalkMate AI voice agent. View calls, update settings, and grow your business.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${dmSans.variable} ${dmMono.variable}`} suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
