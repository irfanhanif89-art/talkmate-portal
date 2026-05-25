import { redirect } from 'next/navigation'

// Sessions 36-37 — vehicles table was dropped by migration 048; the
// rebuilt dispatcher tracks truck_type / truck_rego on the driver
// record. Redirect any stale link to /dispatch.
export default function Page() {
  redirect('/dispatch')
}
