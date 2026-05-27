'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  minLength?: number
  autoComplete?: string
  /**
   * Base style applied to the <input>. The component adds right padding so the
   * eye toggle doesn't overlap typed text — pass the same style you used for
   * other inputs and it'll match.
   */
  style?: React.CSSProperties
  ariaLabel?: string
}

/**
 * Password input with a show/hide toggle on the right. The toggle flips the
 * input's `type` between `password` and `text`. Eye icon switches between
 * `Eye` (currently hidden, click to show) and `EyeOff` (currently shown,
 * click to hide).
 *
 * Drop-in replacement anywhere we had `<input type="password" ... />`.
 */
export default function PasswordInput({
  value, onChange, placeholder, required, minLength, autoComplete,
  style, ariaLabel,
}: Props) {
  const [show, setShow] = useState(false)

  const inputStyle: React.CSSProperties = {
    ...style,
    // Add right padding so typed characters don't slide under the toggle.
    paddingRight: 44,
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        aria-label={ariaLabel}
        style={inputStyle}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        title={show ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 28,
          height: 28,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          color: '#7BAED4',
          cursor: 'pointer',
          borderRadius: 6,
        }}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}
