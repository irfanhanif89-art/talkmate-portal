'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'

// ButtonV2 — named to avoid collision with src/components/ui/button.tsx
//
// primary:   orange gradient bg, white text, glow shadow (from dashboard .eofy-cta-btn / .upsell-cta)
//            bg: linear-gradient(135deg,#f58a42,#e86526), shadow: 0 4px 14px rgba(238,106,44,.35)
// secondary: bg-card + border-line + text-text, hover bg-card-2

export interface ButtonV2Props extends React.ComponentProps<'button'> {
  variant?: 'primary' | 'secondary'
}

export const ButtonV2 = React.forwardRef<HTMLButtonElement, ButtonV2Props>(
  ({ variant = 'primary', className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          // base
          'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2',
          'text-[13px] font-semibold whitespace-nowrap transition select-none',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          // variant
          variant === 'primary'
            ? [
                'text-white',
                'bg-[linear-gradient(135deg,#f58a42,#e86526)]',
                'shadow-[0_4px_14px_rgba(238,106,44,.35)]',
                'hover:brightness-110',
              ]
            : [
                'bg-card border border-line text-text',
                'hover:bg-card-2',
              ],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    )
  },
)

ButtonV2.displayName = 'ButtonV2'
