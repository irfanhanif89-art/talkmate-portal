'use client'
import { ThemeProvider as NextThemes } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="dark"
      storageKey="tm-theme"
      value={{ light: 'tm-light', dark: 'tm-dark' }}
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemes>
  )
}
