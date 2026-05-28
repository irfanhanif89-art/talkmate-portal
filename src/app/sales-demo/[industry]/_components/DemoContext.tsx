'use client'

import { createContext, useContext } from 'react'

export type DemoContextValue = {
  businessId: string
  businessName: string
  industry: string
  token: string
}

const Ctx = createContext<DemoContextValue | null>(null)

export function DemoProvider({
  value,
  children,
}: {
  value: DemoContextValue
  children: React.ReactNode
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useDemo(): DemoContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useDemo must be used inside DemoProvider')
  return v
}
