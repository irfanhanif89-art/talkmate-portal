'use client'

import { createContext, useContext } from 'react'
import type { SalesRepRow } from '@/lib/sales-auth'

interface SalesRepContextValue {
  rep: SalesRepRow
}

const SalesRepContext = createContext<SalesRepContextValue | null>(null)

export function SalesRepProvider({ rep, children }: { rep: SalesRepRow; children: React.ReactNode }) {
  return (
    <SalesRepContext.Provider value={{ rep }}>
      {children}
    </SalesRepContext.Provider>
  )
}

export function useSalesRep(): SalesRepRow {
  const ctx = useContext(SalesRepContext)
  if (!ctx) throw new Error('useSalesRep must be used inside SalesRepProvider')
  return ctx.rep
}
