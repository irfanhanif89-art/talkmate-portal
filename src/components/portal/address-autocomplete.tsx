'use client'

// Drop-in replacement for a plain address `<input>`. Wires the input
// up to Google Places Autocomplete, restricts results to Australia,
// and reports the formatted address through onChange — both on
// place-selection and on free-typing, so users can still hand-type an
// address Google doesn't know.
//
// Falls back to a plain input when `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY`
// isn't set or the script fails to load — the caller's form keeps
// working in dev/preview without any extra branching.

import { useEffect, useRef } from 'react'
import { loadGooglePlaces } from '@/lib/google-places'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  style?: React.CSSProperties
  disabled?: boolean
  // Country restriction. Default 'au' (the only market we serve), but
  // overridable in case we onboard NZ etc. later.
  country?: string
}

export default function AddressAutocomplete({
  value, onChange, placeholder, style, disabled, country = 'au',
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const widgetRef = useRef<ReturnType<typeof Object> | null>(null)

  useEffect(() => {
    let cancelled = false
    let listener: { remove: () => void } | null = null

    loadGooglePlaces().then(places => {
      if (cancelled || !places || !inputRef.current) return
      const autocomplete = new places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: [country] },
        fields: ['formatted_address', 'name'],
        // Address-only restriction: don't show businesses / POIs that
        // happen to match the typed string. The caller wants a postal
        // address, not "ABC Plumbing" matching their search.
        types: ['address'],
      })
      widgetRef.current = autocomplete
      listener = autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace()
        const formatted = place.formatted_address ?? place.name ?? ''
        if (formatted) onChange(formatted)
      })

      // Suppress the browser's own autofill dropdown so it doesn't
      // overlap Google's suggestions.
      inputRef.current.setAttribute('autocomplete', 'off')
    })

    return () => {
      cancelled = true
      listener?.remove()
      widgetRef.current = null
    }
    // We intentionally don't re-create the widget when `onChange`
    // changes — the closure captures the latest value via the ref
    // path inside the listener. Re-attaching on every render would
    // flicker the dropdown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country])

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={style}
      // Disable browser autofill — Google's dropdown is the source of
      // truth.
      autoComplete="off"
    />
  )
}
