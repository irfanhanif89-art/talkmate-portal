// Singleton loader for the Google Maps JS API (Places library).
//
// Why not @react-google-maps/api: that package weighs ~120 KB and
// pulls in React wrappers for every Maps feature we don't use. We
// only need the autocomplete widget, which is one global object on
// `window.google.maps.places`. Loading the script ourselves keeps the
// portal bundle lean and avoids a new npm dep.
//
// `loadGooglePlaces()` is idempotent — repeated callers share the
// same in-flight promise, and once resolved the next call returns
// synchronously. If `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` isn't set we
// resolve to `null` so callers can fall back to a plain input.

declare global {
  interface Window {
    google?: {
      maps?: {
        places?: {
          Autocomplete: new (
            input: HTMLInputElement,
            opts?: Record<string, unknown>,
          ) => GoogleAutocomplete
        }
      }
    }
    __googlePlacesLoader?: Promise<GooglePlaces | null>
  }
}

export interface GoogleAutocomplete {
  addListener: (event: 'place_changed', cb: () => void) => { remove: () => void }
  getPlace: () => { formatted_address?: string; name?: string }
}

export interface GooglePlaces {
  Autocomplete: new (
    input: HTMLInputElement,
    opts?: Record<string, unknown>,
  ) => GoogleAutocomplete
}

const SCRIPT_ID = 'google-maps-places-loader'

export function loadGooglePlaces(): Promise<GooglePlaces | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)

  // Already loaded → return synchronously via cached promise.
  if (window.google?.maps?.places) {
    return Promise.resolve(window.google.maps.places)
  }

  if (window.__googlePlacesLoader) return window.__googlePlacesLoader

  const key = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY
  if (!key) {
    // No key configured — fall back to a plain input. We don't throw
    // because that would break the page in dev/preview before the
    // operator sets the env var on Vercel.
    return Promise.resolve(null)
  }

  window.__googlePlacesLoader = new Promise<GooglePlaces | null>((resolve) => {
    // Reuse the tag if some other component already started the load.
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google?.maps?.places ?? null))
      existing.addEventListener('error', () => resolve(null))
      return
    }

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.async = true
    script.defer = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&v=weekly`
    script.onload = () => resolve(window.google?.maps?.places ?? null)
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })

  return window.__googlePlacesLoader
}
