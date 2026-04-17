'use client'

import { createContext, useContext } from 'react'
import { type BusinessTypeConfig, type BusinessType, BUSINESS_TYPE_CONFIG } from '@/lib/business-types'

interface BusinessTypeContextValue {
  businessType: BusinessType
  config: BusinessTypeConfig
  businessName: string
  businessId: string
}

const BusinessTypeContext = createContext<BusinessTypeContextValue>({
  businessType: 'other',
  config: BUSINESS_TYPE_CONFIG.other,
  businessName: '',
  businessId: '',
})

export function BusinessTypeProvider({
  children,
  businessType,
  businessName,
  businessId,
}: {
  children: React.ReactNode
  businessType: BusinessType
  businessName: string
  businessId: string
}) {
  const config = BUSINESS_TYPE_CONFIG[businessType] ?? BUSINESS_TYPE_CONFIG.other
  return (
    <BusinessTypeContext.Provider value={{ businessType, config, businessName, businessId }}>
      {children}
    </BusinessTypeContext.Provider>
  )
}

export function useBusinessType() {
  return useContext(BusinessTypeContext)
}
