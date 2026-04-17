'use client'

import { createContext, useContext, ReactNode } from 'react'
import { BusinessType, BusinessTypeConfig, BUSINESS_TYPE_CONFIG } from '@/lib/business-types'

interface BusinessTypeContextValue {
  businessType: BusinessType
  config: BusinessTypeConfig
  businessId: string
  businessName: string
}

const BusinessTypeContext = createContext<BusinessTypeContextValue>({
  businessType: 'other',
  config: BUSINESS_TYPE_CONFIG.other,
  businessId: '',
  businessName: '',
})

export function BusinessTypeProvider({
  children,
  businessType,
  businessId,
  businessName,
}: {
  children: ReactNode
  businessType: BusinessType
  businessId: string
  businessName: string
}) {
  const config = BUSINESS_TYPE_CONFIG[businessType] ?? BUSINESS_TYPE_CONFIG.other

  return (
    <BusinessTypeContext.Provider value={{ businessType, config, businessId, businessName }}>
      {children}
    </BusinessTypeContext.Provider>
  )
}

export function useBusinessType() {
  return useContext(BusinessTypeContext)
}
