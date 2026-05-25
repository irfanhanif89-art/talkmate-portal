// Pre-call talking points and demo openers for the sales rep's Demo
// Launcher. Each entry is shown on the "prep card" once the rep loads
// the demo for that industry. All strings are em-dash-free.

import type { SalesIndustrySlug } from '@/lib/industry-slugs'

export interface DemoTalkingPoints {
  points: string[]
  opener: string
}

export const DEMO_TALKING_POINTS: Record<SalesIndustrySlug, DemoTalkingPoints> = {
  towing: {
    points: [
      'Mention you are calling after hours so they hear the demo handle a roadside call',
      'Ask for the closest truck and let TalkMate dispatch it',
      'Notice how it captures rego, location, and vehicle on the first call',
    ],
    opener: 'Call and ask for a tow from the Pacific Motorway near Burleigh, 2007 Camry, both back wheels gone.',
  },
  restaurants: {
    points: [
      'Book a table for four at 7pm Friday, then ring back and try to move it',
      'Ask about kids menu and corkage',
      'Notice it sends the booking confirmation by SMS without you asking',
    ],
    opener: 'Call and book a table for four at 7pm Friday. Then ring back and ask to move it to 7.30pm.',
  },
  real_estate: {
    points: [
      'Pretend you saw a listing on realestate.com.au and want an inspection',
      'Ask for the price guide and whether the seller will take an offer before auction',
      'Notice it books the inspection into the diary and SMSs you confirmation',
    ],
    opener: 'Call and ask about the 3-bedroom house on Smith Street, get me an inspection on Saturday.',
  },
  trades: {
    points: [
      'Ask for a quote on a deck rebuild',
      'Give a vague address and notice how it asks the right follow-up questions',
      'Tell it you cannot talk for long and watch it wrap up cleanly',
    ],
    opener: 'Call and ask for a quote on a deck rebuild at 12 Sample Street, Burleigh.',
  },
  healthcare: {
    points: [
      'Book a routine appointment, then call back and say it is urgent',
      'Ask whether you can claim on Medicare',
      'Notice it picks up urgency cues and routes the call differently',
    ],
    opener: 'Call and book a routine GP appointment for next Tuesday.',
  },
  plumbing: {
    points: [
      'Call after hours and say your hot water is gushing',
      'Give the address and ask for the next available tech',
      'Notice it gets the urgency, books the job, and SMSs the ETA',
    ],
    opener: 'Call and say your hot water tank is leaking everywhere at 47 King Street, Coolangatta. Urgent.',
  },
  electrical: {
    points: [
      'Ask about a power point install and a switchboard inspection',
      'Mention you have a tenant on site so they need to book through you',
      'Notice it captures access notes and routes accordingly',
    ],
    opener: 'Call and ask for a new power point in the kitchen and a switchboard inspection.',
  },
  hvac: {
    points: [
      'Call in a heatwave scenario, AC unit not turning on',
      'Give the make, model, and address',
      'Notice it triages urgency and books the right tech',
    ],
    opener: 'Call and request urgent AC repair. It is 35 degrees and the system is down.',
  },
  ndis: {
    points: [
      'Call as a new participant looking for supports',
      'Mention you have a self-managed plan and want to know what is on offer',
      'Notice it qualifies you and books a coordinator call back',
    ],
    opener: 'Call and ask about NDIS supports for a self-managed plan.',
  },
  retail: {
    points: [
      'Ask about a specific product, stock, and store hours',
      'Try to put an item on hold',
      'Notice it answers basic questions without escalating to a person',
    ],
    opener: 'Call and ask whether they have size 10 of a popular sneaker in stock, then try to put it on hold.',
  },
  professional: {
    points: [
      'Call as a new client wanting to book a discovery meeting',
      'Ask about fees and turnaround',
      'Notice it captures your details and sends a confirmation',
    ],
    opener: 'Call and ask to book a first meeting with the firm to discuss a new matter.',
  },
  beauty: {
    points: [
      'Book a treatment, then call back and reschedule',
      'Ask about pricing and what is included',
      'Notice it handles the reschedule cleanly and SMSs you the new time',
    ],
    opener: 'Call and book a facial for Saturday, then ring back and move it to Sunday.',
  },
  gym: {
    points: [
      'Ask about a free trial and class times',
      'Mention you want to bring a friend',
      'Notice it books the trial and SMSs you the details',
    ],
    opener: 'Call and ask about a free trial week and the timetable for spin classes.',
  },
  auto: {
    points: [
      'Book a logbook service, then call back and say you need a courtesy car',
      'Give your rego and notice how it captures the right details',
      'Mention the engine light is on and watch how it triages',
    ],
    opener: 'Call and book a logbook service for a 2018 Hilux, rego 1ABC234.',
  },
}
