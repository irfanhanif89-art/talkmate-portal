'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EofyBannerProps {
  mode?: 'strip' | 'hero'
  message: ReactNode
  ctaLabel?: string
  onCta?: () => void
  onDismiss?: () => void
  className?: string
  /** hero-only: large number shown top-right, e.g. "$150–$400" */
  heroAmount?: ReactNode
  /** hero-only: sub-text under the large number */
  heroAmountSub?: string
}

export function EofyBanner({
  mode = 'strip',
  message,
  ctaLabel,
  onCta,
  onDismiss,
  className,
  heroAmount,
  heroAmountSub,
}: EofyBannerProps) {
  if (mode === 'hero') {
    return (
      <div
        className={cn(
          'relative flex items-center gap-5 overflow-hidden rounded-[16px]',
          'border border-[rgba(242,181,60,.45)] p-[18px_24px]',
          'bg-[linear-gradient(135deg,rgba(242,181,60,.18),rgba(238,106,44,.14))]',
          className
        )}
      >
        {/* Radial glow (::after equivalent) */}
        <div
          className="pointer-events-none absolute right-[-40px] top-[-40px] h-[200px] w-[200px] rounded-full"
          style={{
            background: 'radial-gradient(circle,rgba(242,181,60,.3),transparent 70%)',
          }}
          aria-hidden="true"
        />

        {/* Badge */}
        <span
          className={cn(
            'flex-shrink-0 rounded-[9px] px-[14px] py-[8px]',
            'bg-[linear-gradient(135deg,#f2b53c,#e8922a)]',
            'text-[11px] font-[800] uppercase tracking-[.10em] text-white',
            'shadow-[0_6px_18px_rgba(242,181,60,.5)]'
          )}
        >
          🎉 EOFY Sale — Ends 30 June
        </span>

        {/* Body */}
        <div className="relative z-10 flex-1">
          <div className="text-[20px] font-[800] leading-tight tracking-[-0.3px] text-text">
            {message}
          </div>
        </div>

        {/* Right: amount + CTA */}
        {(heroAmount || ctaLabel) && (
          <div className="relative z-10 flex flex-shrink-0 flex-col items-end gap-[8px]">
            {heroAmount && (
              <div>
                <div className="tnum text-[36px] font-[800] leading-none tracking-[-1px] text-gold">
                  {heroAmount}
                </div>
                {heroAmountSub && (
                  <div className="mt-[2px] text-right text-[12px] text-[rgba(255,255,255,.5)]">
                    {heroAmountSub}
                  </div>
                )}
              </div>
            )}
            {ctaLabel && (
              <button
                type="button"
                onClick={onCta}
                className={cn(
                  'block rounded-[11px] px-[20px] py-[10px]',
                  'bg-[linear-gradient(135deg,#f58a42,#e86526)]',
                  'text-[13.5px] font-[800] text-white',
                  'shadow-[0_6px_18px_rgba(238,106,44,.4)]',
                  'cursor-pointer whitespace-nowrap transition-opacity hover:opacity-90'
                )}
              >
                {ctaLabel}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  /* Strip mode (default) */
  return (
    <div
      className={cn(
        'flex items-center gap-[13px] rounded-[var(--r)] border border-[rgba(242,181,60,.4)] p-[11px_18px]',
        'bg-[linear-gradient(135deg,rgba(242,181,60,.14),rgba(238,106,44,.12))]',
        className
      )}
    >
      {/* Badge */}
      <span
        className={cn(
          'flex-shrink-0 rounded-[6px] px-[9px] py-[4px]',
          'bg-[linear-gradient(135deg,#f2b53c,#e8922a)]',
          'text-[9.5px] font-[800] uppercase tracking-[.12em] text-white'
        )}
      >
        🎉 EOFY Sale
      </span>

      {/* Message */}
      <span className="flex-1 text-[13px] font-[600] text-text [&_em]:not-italic [&_em]:font-[800] [&_em]:text-gold [&_strong]:font-[800] [&_strong]:text-gold">
        {message}
      </span>

      {/* CTA */}
      {ctaLabel && (
        <button
          type="button"
          onClick={onCta}
          className={cn(
            'flex-shrink-0 rounded-[8px] px-[14px] py-[7px]',
            'bg-[linear-gradient(135deg,#f58a42,#e86526)]',
            'cursor-pointer border-0 text-[12px] font-[700] text-white',
            'transition-opacity hover:opacity-90'
          )}
        >
          {ctaLabel}
        </button>
      )}

      {/* Dismiss */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex-shrink-0 cursor-pointer text-[11px] text-[rgba(255,255,255,.25)] transition-colors hover:text-[rgba(255,255,255,.5)]"
        >
          ✕
        </button>
      )}
    </div>
  )
}
