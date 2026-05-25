// Industry-specific bullets + plan feature copy for the sales proposal
// generator. All strings are em-dash-free, never name Vapi/Twilio/Make
// in user-facing text, and reference "TalkMate" with capital T and M.

import type { SalesIndustrySlug } from '@/lib/industry-slugs'

export const PLAN_FEATURES: Record<'starter' | 'growth' | 'pro', { price: number; features: string[] }> = {
  starter: {
    price: 299,
    features: [
      'Answers every call, day or night',
      'Books jobs and takes messages',
      'Sends a summary text after each call',
      'Up to 200 calls per month included',
    ],
  },
  growth: {
    price: 499,
    features: [
      'Everything in Starter',
      'Custom scripts for your business',
      'Up to 500 calls per month included',
      'Priority support, same-day changes',
    ],
  },
  pro: {
    price: 799,
    features: [
      'Everything in Growth',
      'Unlimited calls',
      'Direct line to our team for tweaks',
      'Dedicated account manager',
    ],
  },
}

export const DEFAULT_BULLETS: string[] = [
  'Answer every call, even when you are on the tools or with a customer',
  'Book jobs and take messages right inside your existing system',
  'Send the caller a text summary so nothing falls through the cracks',
]

export const INDUSTRY_BULLETS: Record<SalesIndustrySlug, string[]> = {
  towing: [
    'Take roadside callouts 24/7 and dispatch the closest truck',
    'Capture location, vehicle, and rego details on the first call',
    'Text the customer their ETA so they stop ringing for updates',
  ],
  restaurants: [
    'Take bookings, change covers, and confirm specials without a host on the phone',
    'Answer the same five questions (hours, parking, kids menu) 100 times a week',
    'Send a confirmation text the moment the booking is made',
  ],
  real_estate: [
    'Capture every buyer enquiry from your listings without playing phone tag',
    'Book inspection times straight into your diary',
    'Qualify cold leads and SMS you the warm ones',
  ],
  trades: [
    'Take quote requests while you are on the tools',
    'Capture job address, scope, and best contact time',
    'Send the customer a confirmation and put the job on your list',
  ],
  healthcare: [
    'Take appointment requests and triage urgency without a receptionist on the phone',
    'Answer routine clinic questions (hours, locations, billing) instantly',
    'Send appointment reminders and confirmations by SMS',
  ],
  plumbing: [
    'Take emergency and quote calls 24/7, even on weekends',
    'Capture the address, scope, and urgency on the first call',
    'Send the customer their booking confirmation and the tech ETA',
  ],
  electrical: [
    'Take quote and call-out requests around the clock',
    'Capture site address, fault, and access notes on the first call',
    'SMS the customer with their booking and the spark on the way',
  ],
  hvac: [
    'Take service requests in heatwaves and cold snaps without missing one',
    'Capture make, model, fault, and address on the first call',
    'SMS the customer with their tech and ETA',
  ],
  ndis: [
    'Take new participant enquiries and refer them to the right coordinator',
    'Answer routine questions about supports, billing, and hours',
    'Capture provider, plan number, and best contact time',
  ],
  retail: [
    'Product questions, store hours, stock availability, all handled automatically',
    'Take orders or hold items over the phone',
    'Direct the call to the right department or team member',
  ],
  professional: [
    'Take new client enquiries and book a first meeting straight into your diary',
    'Answer common questions about fees, scope, and turnaround',
    'Send the prospect a confirmation and brief intake form by SMS',
  ],
  beauty: [
    'Take new bookings, rescheduling, and cancellation calls without picking up',
    'Answer the routine questions (pricing, treatments, parking) every time',
    'Send appointment confirmations and reminders by SMS',
  ],
  gym: [
    'Take trial bookings, membership enquiries, and tour requests',
    'Answer questions on classes, opening hours, and pricing',
    'SMS the new lead with their trial details on the spot',
  ],
  auto: [
    'Take service and quote calls without leaving the workshop',
    'Capture rego, fault, and customer details on the first call',
    'SMS the customer with their booking and a courtesy reminder',
  ],
}
