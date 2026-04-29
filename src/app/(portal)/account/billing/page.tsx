import { redirect } from 'next/navigation'

// The Session 3 brief specs /account/billing. The actual page lives at
// /billing (carried over from Sessions 1–2). Redirect so deep links to
// the brief-spec'd path land on the canonical route.
export default function AccountBillingRedirect() {
  redirect('/billing')
}
