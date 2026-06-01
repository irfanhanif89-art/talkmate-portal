import TrainingClient from '@/components/sales/TrainingClient'

export const metadata = { title: 'Training — TalkMate Sales HQ' }

// Access is enforced by the parent /sales layout (sales_reps gate).
export default function SalesTrainingPage() {
  return <TrainingClient />
}
