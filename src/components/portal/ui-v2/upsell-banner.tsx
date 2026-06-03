'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface UpsellBannerProps {
  title: ReactNode
  subtitle?: ReactNode
  ctaLabel: string
  onCta?: () => void
  onDismiss?: () => void
  className?: string
}

export function UpsellBanner({
  title,
  subtitle,
  ctaLabel,
  onCta,
  onDismiss,
  className,
}: UpsellBannerProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-[11px] rounded-[11px]',
        'border border-[rgba(238,106,44,.3)] bg-card p-[12px_16px]',
        className
      )}
    >
      {/* Pulsing dot — reuses the global .upsell-dot class */}
      <div className="upsell-dot" aria-hidden="true" />

      {/* Body */}
      <div className="min-w-0 flex-1">
        <strong className="block text-[12.5px] font-[700] text-text">
          {title}
        </strong>
        {subtitle && (
          <span className="mt-[2px] block text-[11.5px] text-[rgba(255,255,255,.45)]">
            {subtitle}
          </span>
        )}
      </div>

      {/* CTA button */}
      <button
        type="button"
        onClick={onCta}
        className={cn(
          'flex-shrink-0 cursor-pointer whitespace-nowrap rounded-[8px] border-0',
          'bg-[linear-gradient(135deg,#f58a42,#e86526)] px-[14px] py-[7px]',
          'text-[12px] font-[600] text-white transition-opacity hover:opacity-90'
        )}
      >
        {ctaLabel}
      </button>

      {/* Dismiss */}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="ml-[2px] flex-shrink-0 cursor-pointer text-[11px] text-[rgba(255,255,255,.2)] transition-colors hover:text-[rgba(255,255,255,.45)]"
        >
          ✕
        </button>
      )}
    </div>
  )
}
