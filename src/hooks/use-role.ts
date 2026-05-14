'use client'

// useRole — Session 11.
//
// Resolves the current authenticated user's PortalRole. Priority:
//   1. businesses.owner_user_id matches user.id   → 'owner'
//   2. staff_members row with auth_user_id=user.id and active=true
//      for the same client_id                     → row.role
//   3. nothing                                    → null
//
// Internal admins (users.role = 'admin') without a business of their own
// fall through to null here — that's fine; the admin UI uses
// requireAdmin() on the server, not this hook.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PortalRole } from '@/lib/rbac'

export interface RoleState {
  role: PortalRole | null
  clientId: string | null
  loading: boolean
}

export function useRole(): RoleState {
  const [state, setState] = useState<RoleState>({ role: null, clientId: null, loading: true })

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (!cancelled) setState({ role: null, clientId: null, loading: false })
        return
      }

      // Owner check first — businesses.owner_user_id uniqueness is
      // enforced by migration 025 so at most one match is possible.
      const { data: ownedBiz } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_user_id', user.id)
        .maybeSingle()
      if (ownedBiz?.id) {
        if (!cancelled) setState({ role: 'owner', clientId: ownedBiz.id as string, loading: false })
        return
      }

      // Otherwise look for an accepted staff_members row.
      const { data: staff } = await supabase
        .from('staff_members')
        .select('role, client_id')
        .eq('auth_user_id', user.id)
        .eq('active', true)
        .maybeSingle()
      if (staff?.role && (staff.role === 'manager' || staff.role === 'staff')) {
        if (!cancelled) {
          setState({
            role: staff.role as PortalRole,
            clientId: (staff.client_id as string) ?? null,
            loading: false,
          })
        }
        return
      }

      if (!cancelled) setState({ role: null, clientId: null, loading: false })
    }
    load()
    return () => { cancelled = true }
  }, [])

  return state
}
