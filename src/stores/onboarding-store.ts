import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface OnboardingResponses {
  // Step 1: Business details
  businessName?: string
  abn?: string
  address?: string
  website?: string
  phone?: string
  timezone?: string
  businessType?: string

  // Step 2: Opening hours
  openingHours?: Record<string, { open: string; close: string; isOpen: boolean }>

  // Step 3: Catalog
  catalogItems?: Array<{ name: string; description: string; price?: number; category: string; duration?: number }>

  // Step 4: Greeting & voice
  greeting?: string
  voiceId?: string
  tone?: string

  // Step 5: FAQs
  faqs?: Array<{ question: string; answer: string }>

  // Step 6: Escalation rules
  escalationRules?: Array<{ trigger: string; action: string }>

  // Step 7: Notifications
  notifications?: {
    emailOnTransfer?: boolean
    dailySummary?: boolean
    weeklyReport?: boolean
    smsOnTransfer?: boolean
    alertAt80?: boolean
    notificationEmail?: string
    notificationPhone?: string
  }
}

interface OnboardingStore {
  currentStep: number
  responses: OnboardingResponses
  setStep: (step: number) => void
  nextStep: () => void
  prevStep: () => void
  updateResponses: (data: Partial<OnboardingResponses>) => void
  reset: () => void
}

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      currentStep: 1,
      responses: {},
      setStep: (step) => set({ currentStep: step }),
      nextStep: () => set((state) => ({ currentStep: Math.min(state.currentStep + 1, 8) })),
      prevStep: () => set((state) => ({ currentStep: Math.max(state.currentStep - 1, 1) })),
      updateResponses: (data) =>
        set((state) => ({ responses: { ...state.responses, ...data } })),
      reset: () => set({ currentStep: 1, responses: {} }),
    }),
    {
      name: 'talkmate-onboarding',
    }
  )
)
