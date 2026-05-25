import { redirect } from 'next/navigation'

// Sessions 36-37 — the v1 /dispatch/drivers sub-route was replaced by
// the Drivers tab inside the rebuilt /dispatch page. Redirect.
export default function Page() {
  redirect('/dispatch')
}
