// Shared types for the AI Receptionist hub (/train) and its tab components.
// Kept in a leaf module so the tab components and train-view can import them
// without a circular dependency.

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'error'

export type CategoryKey = 'faq' | 'service' | 'hours' | 'pricing' | 'team' | 'custom'

export interface KbEntryDTO {
  id: string
  category: CategoryKey
  question: string
  answer: string
  sortOrder: number
  updatedAt: string
}

// Prefix a path with ?adminClientId=… when an admin is editing on behalf of a
// client, so the API routes hit their admin-override branch.
export function withAdmin(path: string, adminClientId: string | null | undefined): string {
  if (!adminClientId) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}adminClientId=${encodeURIComponent(adminClientId)}`
}
