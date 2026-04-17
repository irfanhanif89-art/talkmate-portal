import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface OnboardingResponses {
  businessName?: string
  businessType?: string
  address?: string
  phone?: string
  website?: string
  abn?: string
  timezone?: string
  openingHours?: Record<string, { open: string; close: string; closed: boolean }>
  catalogItems?: Array<{ name: string; category: string; price?: number; duration?: number }>
  greeting?: string
  voice?: string
  tone?: string
  faqs?: Array<{ question: string; answer: string }>
  escalationRules?: Array<{ trigger: string; action: string }>
  notifications?: {
    emailOnTransfer: boolean
    emailAddress: string
    dailySummary: boolean
    weeklyReport: boolean
    smsOnTransfer: boolean
    mobileNumber: string
  }
}

interface OnboardingStore {
  currentStep: number
  responses: OnboardingResponses
  setStep: (step: number) => void
  setResponse: (key: keyof OnboardingResponses, value: unknown) => void
  reset: () => void
}

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      currentStep: 1,
      responses: {},
      setStep: (step) => set({ currentStep: step }),
      setResponse: (key, value) =>
        set((state) => ({ responses: { ...state.responses, [key]: value } })),
      reset: () => set({ currentStep: 1, responses: {} }),
    }),
    { name: 'talkmate-onboarding' }
  )
)
