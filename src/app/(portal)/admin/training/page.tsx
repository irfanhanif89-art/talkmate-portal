import type { Metadata } from 'next'
import TrainingClient from '@/components/sales/TrainingClient'

export const metadata: Metadata = { title: 'Product Training' }
export const dynamic = 'force-dynamic'

// Access is enforced by the parent (portal)/admin layout (super-admin email
// or users.role === 'admin'). This route lets admins review the exact
// product training their sales contractors see, without going through the
// /sales rep gate (which redirects admins away).
export default function AdminTrainingPage() {
  return <TrainingClient topInset />
}
