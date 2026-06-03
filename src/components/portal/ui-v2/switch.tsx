'use client'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

// ─── Switch ──────────────────────────────────────────────────────────────────
//
// variant='orange'  — from receptionist.html .toggle-bg
//   track: 38×22px, radius 11px, OFF=bg-card-2/border-line, ON=bg-orange/border-orange
//   knob:  16×16px, left:2px → left:20px
//
// variant='green'   — from catalog.html .toggle
//   track: 30×17px, radius 9px, OFF=bg-line-strong, ON=bg-green
//   knob:  13×13px, left:2px → right:2px
//
// variant='check'   — from settings.html .chk
//   20×20px rounded-[5px] square
//   OFF: transparent bg, border-2 border-line-strong
//   ON:  bg-orange, border-orange, white check icon 12×12px

export interface SwitchProps {
  checked: boolean
  onChange: (v: boolean) => void
  variant?: 'orange' | 'green' | 'check'
  disabled?: boolean
  'aria-label'?: string
  className?: string
}

export function Switch({
  checked,
  onChange,
  variant = 'orange',
  disabled = false,
  className,
  ...rest
}: SwitchProps) {
  const handleClick = () => {
    if (!disabled) onChange(!checked)
  }

  if (variant === 'check') {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={handleClick}
        disabled={disabled}
        className={cn(
          // 20×20px, radius 5px
          'w-5 h-5 rounded-[5px] border-2 flex items-center justify-center transition',
          checked
            ? 'bg-orange border-orange'
            : 'bg-transparent border-[rgba(255,255,255,.10)] hover:border-[rgba(255,255,255,.20)]',
          disabled && 'opacity-40 cursor-not-allowed',
          className,
        )}
        {...rest}
      >
        {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </button>
    )
  }

  if (variant === 'green') {
    // Track: 30×17px, knob: 13×13px
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={handleClick}
        disabled={disabled}
        className={cn(
          'relative flex-shrink-0 rounded-[9px] transition-colors',
          'w-[30px] h-[17px]',
          checked ? 'bg-green' : 'bg-[rgba(255,255,255,.10)]',
          disabled && 'opacity-40 cursor-not-allowed',
          className,
        )}
        {...rest}
      >
        <span
          className={cn(
            'absolute top-[2px] w-[13px] h-[13px] rounded-full bg-white transition-all duration-200',
            'shadow-[0_1px_3px_rgba(0,0,0,.3)]',
            checked ? 'right-[2px] left-auto' : 'left-[2px]',
          )}
        />
      </button>
    )
  }

  // variant === 'orange' (default)
  // Track: 38×22px, knob: 16×16px, left:2px ON → left:20px
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'relative flex-shrink-0 rounded-[11px] border transition-colors duration-200',
        'w-[38px] h-[22px]',
        checked
          ? 'bg-orange border-orange'
          : 'bg-card-2 border-line',
        disabled && 'opacity-40 cursor-not-allowed',
        className,
      )}
      {...rest}
    >
      <span
        className={cn(
          'absolute top-[2px] w-[16px] h-[16px] rounded-full bg-white transition-all duration-200',
          'shadow-[0_1px_3px_rgba(0,0,0,.3)]',
          checked ? 'left-[20px]' : 'left-[2px]',
        )}
      />
    </button>
  )
}
