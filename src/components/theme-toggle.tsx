'use client'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div style={{ width: 72, height: 32 }} />
  const isLight = theme === 'light'
  return (
    <div className="flex items-center gap-0 rounded-full border border-line bg-card-2 p-[3px]">
      <button onClick={() => setTheme('dark')} aria-label="Dark mode"
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${!isLight ? 'bg-orange text-white' : 'text-dim'}`}>
        <Moon size={13} /> Dark
      </button>
      <button onClick={() => setTheme('light')} aria-label="Light mode"
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${isLight ? 'bg-white text-[#15202c]' : 'text-dim'}`}>
        <Sun size={13} /> Light
      </button>
    </div>
  )
}
