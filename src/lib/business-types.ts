export type BusinessType =
  | 'hospitality'
  | 'trades'
  | 'medical'
  | 'beauty'
  | 'fitness'
  | 'real_estate'
  | 'automotive'
  | 'professional'
  | 'retail'
  | 'other'

export interface BusinessTypeConfig {
  catalogLabel: string
  catalogItemLabel: string
  catalogCategories: string[]
  hasUpsells: boolean
  hasPricing: boolean
  hasAppointments: boolean
  hasJobDispatch: boolean
  callOutcomeTypes: string[]
  primaryMetric: string
  dashboardMetricLabel: string
  escalationTemplate: string
  complianceRule?: string
}

export const BUSINESS_TYPE_CONFIG: Record<BusinessType, BusinessTypeConfig> = {
  hospitality: {
    catalogLabel: 'Menu',
    catalogItemLabel: 'Menu Item',
    catalogCategories: ['Mains', 'Sides', 'Drinks', 'Desserts', 'Specials'],
    hasUpsells: true,
    hasPricing: true,
    hasAppointments: false,
    hasJobDispatch: false,
    callOutcomeTypes: ['Order Taken', 'Reservation Made', 'FAQ Answered', 'Transferred', 'Missed'],
    primaryMetric: 'Revenue Recovered',
    dashboardMetricLabel: 'Orders Taken Today',
    escalationTemplate: 'If caller has a complaint → Transfer immediately',
  },
  trades: {
    catalogLabel: 'Services',
    catalogItemLabel: 'Service',
    catalogCategories: ['Emergency', 'Scheduled', 'Quotes', 'Maintenance'],
    hasUpsells: false,
    hasPricing: true,
    hasAppointments: true,
    hasJobDispatch: true,
    callOutcomeTypes: ['Job Booked', 'Quote Requested', 'FAQ Answered', 'Transferred', 'Missed'],
    primaryMetric: 'Jobs Booked',
    dashboardMetricLabel: 'Jobs Booked Today',
    escalationTemplate: 'If caller mentions burst pipe, flooding, no power → Transfer immediately',
  },
  medical: {
    catalogLabel: 'Services',
    catalogItemLabel: 'Appointment Type',
    catalogCategories: ['GP', 'Specialist', 'Procedure', 'Telehealth'],
    hasUpsells: false,
    hasPricing: false,
    hasAppointments: true,
    hasJobDispatch: false,
    callOutcomeTypes: ['Appointment Booked', 'Rx Enquiry', 'FAQ Answered', 'Transferred', 'Urgent'],
    primaryMetric: 'Appointments Booked',
    dashboardMetricLabel: 'Appointments Booked Today',
    escalationTemplate: 'If caller describes chest pain or emergency → Transfer immediately',
    complianceRule: 'Never provide medical advice. Always recommend the patient speak with a doctor.',
  },
  beauty: {
    catalogLabel: 'Services',
    catalogItemLabel: 'Service',
    catalogCategories: ['Hair', 'Nails', 'Skin', 'Beauty', 'Packages'],
    hasUpsells: true,
    hasPricing: true,
    hasAppointments: true,
    hasJobDispatch: false,
    callOutcomeTypes: ['Appointment Booked', 'FAQ Answered', 'Transferred', 'Missed'],
    primaryMetric: 'Appointments Booked',
    dashboardMetricLabel: 'Bookings Today',
    escalationTemplate: 'If caller wants to speak with a stylist → Transfer immediately',
  },
  fitness: {
    catalogLabel: 'Programs',
    catalogItemLabel: 'Program / Class',
    catalogCategories: ['Classes', 'Personal Training', 'Memberships', 'Packages'],
    hasUpsells: true,
    hasPricing: true,
    hasAppointments: true,
    hasJobDispatch: false,
    callOutcomeTypes: ['Trial Booked', 'Membership Enquiry', 'Class Booked', 'FAQ Answered', 'Transferred', 'Missed'],
    primaryMetric: 'Trials Booked',
    dashboardMetricLabel: 'Trials & Bookings Today',
    escalationTemplate: 'If caller has a medical condition or injury → Transfer immediately',
  },
  real_estate: {
    catalogLabel: 'Listings',
    catalogItemLabel: 'Property / Service',
    catalogCategories: ['For Sale', 'For Rent', 'Property Management', 'Appraisals'],
    hasUpsells: false,
    hasPricing: false,
    hasAppointments: true,
    hasJobDispatch: false,
    callOutcomeTypes: ['Inspection Booked', 'Appraisal Booked', 'Enquiry Logged', 'FAQ Answered', 'Transferred', 'Missed'],
    primaryMetric: 'Inspections Booked',
    dashboardMetricLabel: 'Inspections & Appraisals Today',
    escalationTemplate: 'If caller wants to make an offer → Transfer immediately',
  },
  automotive: {
    catalogLabel: 'Services',
    catalogItemLabel: 'Service',
    catalogCategories: ['Repairs', 'Towing', 'Servicing', 'Quotes', 'Emergency'],
    hasUpsells: false,
    hasPricing: true,
    hasAppointments: true,
    hasJobDispatch: true,
    callOutcomeTypes: ['Job Dispatched', 'Booking Made', 'Quote Requested', 'FAQ Answered', 'Transferred', 'Missed'],
    primaryMetric: 'Jobs Dispatched',
    dashboardMetricLabel: 'Jobs Dispatched Today',
    escalationTemplate: 'If caller is stranded or in danger → Transfer immediately',
  },
  professional: {
    catalogLabel: 'Services',
    catalogItemLabel: 'Service',
    catalogCategories: ['Consultations', 'Fixed Fee', 'Retainer', 'Packages'],
    hasUpsells: false,
    hasPricing: false,
    hasAppointments: true,
    hasJobDispatch: false,
    callOutcomeTypes: ['Consultation Booked', 'Enquiry Logged', 'FAQ Answered', 'Transferred', 'Missed'],
    primaryMetric: 'Consultations Booked',
    dashboardMetricLabel: 'Consultations Booked Today',
    escalationTemplate: 'If caller has an urgent legal or financial matter → Transfer immediately',
  },
  retail: {
    catalogLabel: 'Products',
    catalogItemLabel: 'Product',
    catalogCategories: ['Products', 'Bundles', 'Services', 'Specials'],
    hasUpsells: true,
    hasPricing: true,
    hasAppointments: false,
    hasJobDispatch: false,
    callOutcomeTypes: ['Order Taken', 'Stock Enquiry', 'FAQ Answered', 'Transferred', 'Missed'],
    primaryMetric: 'Revenue Recovered',
    dashboardMetricLabel: 'Orders Taken Today',
    escalationTemplate: 'If caller has a complaint or return request → Transfer immediately',
  },
  other: {
    catalogLabel: 'Services',
    catalogItemLabel: 'Service',
    catalogCategories: ['Services', 'Packages', 'Other'],
    hasUpsells: false,
    hasPricing: true,
    hasAppointments: true,
    hasJobDispatch: false,
    callOutcomeTypes: ['Enquiry Logged', 'Booking Made', 'FAQ Answered', 'Transferred', 'Missed'],
    primaryMetric: 'Enquiries Captured',
    dashboardMetricLabel: 'Enquiries Today',
    escalationTemplate: 'If caller needs urgent assistance → Transfer immediately',
  },
}

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  hospitality: 'Restaurant / Café / Takeaway',
  trades: 'Trades (Plumber, Electrician, Builder…)',
  medical: 'Medical / Allied Health',
  beauty: 'Beauty / Hair / Nails',
  fitness: 'Gym / Fitness / Personal Training',
  real_estate: 'Real Estate',
  automotive: 'Automotive / Towing / Smash Repairs',
  professional: 'Professional Services (Legal, Accounting…)',
  retail: 'Retail / Shop',
  other: 'Other',
}
