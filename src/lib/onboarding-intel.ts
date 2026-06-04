// Session 4A — shared onboarding-intelligence constants.
// Used by auto-populate, suggest-kb, the Call Flow tab, the integration step,
// and the admin apply-intake-questions route, so the data lives in one place.

export type TalkMateIndustry =
  | 'towing' | 'plumbing' | 'electrical' | 'cleaning' | 'hvac'
  | 'building' | 'landscaping' | 'pest_control' | 'other'

// Google Places `types[]` -> TalkMate industry.
const PLACE_TYPE_MAP: Record<string, TalkMateIndustry> = {
  car_repair: 'towing',
  car_dealer: 'towing',
  moving_company: 'towing',
  plumber: 'plumbing',
  electrician: 'electrical',
  house_cleaning_service: 'cleaning',
  laundry: 'cleaning',
  hvac_contractor: 'hvac',
  general_contractor: 'building',
  roofing_contractor: 'building',
  painter: 'building',
  landscaper: 'landscaping',
  lawn_care_service: 'landscaping',
  pest_control: 'pest_control',
}

export function mapPlaceTypesToIndustry(types: string[] | undefined | null): TalkMateIndustry {
  if (!types) return 'other'
  for (const t of types) {
    const mapped = PLACE_TYPE_MAP[t]
    if (mapped) return mapped
  }
  return 'other'
}

// Per-industry opening intake questions seeded into call_flow_questions.
// Industries align with Session 3 industry_packs (towing/plumbing/electrical/
// cleaning/hvac) plus an 'other' fallback.
export const INTAKE_QUESTIONS: Record<string, { question: string; purpose: string }[]> = {
  towing: [
    { question: "Can you tell me where you're located right now?", purpose: 'Get caller location first for safety and ETA' },
    { question: 'What type of vehicle is it?', purpose: 'Determine equipment needed' },
    { question: "Are you in a safe location, off the road and away from traffic?", purpose: 'Safety check before anything else' },
    { question: "What's the problem with the vehicle?", purpose: 'Understand the job type' },
  ],
  plumbing: [
    { question: "What's the problem you're experiencing?", purpose: 'Understand urgency and job type' },
    { question: 'Is this an emergency, like a burst pipe or no hot water?', purpose: 'Triage urgency' },
    { question: 'Is this a residential property or commercial?', purpose: 'Determines pricing and approach' },
    { question: "What's the address for the job?", purpose: 'Location for scheduling' },
  ],
  electrical: [
    { question: 'What electrical problem are you experiencing?', purpose: 'Understand job type' },
    { question: 'Is this an emergency, like a safety switch tripping or sparking?', purpose: 'Safety and urgency triage' },
    { question: 'What suburb are you in?', purpose: 'Check service area' },
    { question: 'Is this for a house, apartment, or commercial property?', purpose: 'Determines pricing and licensing' },
  ],
  cleaning: [
    { question: 'What type of clean are you after, regular, end of lease, or a one-off?', purpose: 'Job type for pricing' },
    { question: 'How many bedrooms does the property have?', purpose: 'Size for time and pricing estimate' },
    { question: 'What suburb is the property in?', purpose: 'Service area check' },
    { question: 'Do you have a preferred day or time in mind?', purpose: 'Scheduling' },
  ],
  hvac: [
    { question: 'Are you looking to book a service, repair, or installation?', purpose: 'Job type triage' },
    { question: 'What brand and type of system do you have?', purpose: 'Equipment compatibility' },
    { question: "What's the problem you're experiencing?", purpose: 'Diagnose issue before visit' },
    { question: 'What suburb are you in?', purpose: 'Service area and scheduling' },
  ],
  other: [
    { question: "Can you tell me a bit about what you're after?", purpose: 'Open-ended enquiry capture' },
    { question: "What's your name and best contact number?", purpose: 'Lead capture' },
    { question: 'What area are you located in?', purpose: 'Service area check' },
  ],
}

export function intakeQuestionsFor(industry: string | null | undefined): { question: string; purpose: string }[] {
  if (industry && INTAKE_QUESTIONS[industry]) return INTAKE_QUESTIONS[industry]
  return INTAKE_QUESTIONS.other
}

// Carrier call-forwarding instructions for the go-live screen. The owner does
// this on their own phone — TalkMate never changes phone settings.
// {NUMBER} and {RINGS} are substituted in the UI.
export const FORWARDING_INSTRUCTIONS: Record<string, Record<string, string>> = {
  overflow: {
    telstra: 'Dial **61*{NUMBER}*11*{RINGS}# from your mobile, then press call.',
    optus: 'Dial **61*{NUMBER}*11*{RINGS}# from your mobile, then press call.',
    vodafone: 'Open Phone app > Settings > Call Forwarding > Forward When Unanswered, and enter {NUMBER}.',
    other: "Contact your carrier to set up Forward When Unanswered to {NUMBER}.",
  },
  after_hours: {
    telstra: 'Set Forward When Unanswered to {NUMBER} during your after-hours periods. Your carrier can help.',
    optus: 'Set Forward When Unanswered to {NUMBER} during your after-hours periods. Your carrier can help.',
    vodafone: 'Open Phone app > Settings > Call Forwarding and set forwarding to {NUMBER} for after-hours.',
    other: 'Set up call forwarding to {NUMBER} during after-hours periods. Your carrier can help.',
  },
  full_time: {
    telstra: 'Dial **21*{NUMBER}# from your mobile to forward all calls, then press call.',
    optus: 'Dial **21*{NUMBER}# from your mobile to forward all calls, then press call.',
    vodafone: 'Open Phone app > Settings > Call Forwarding > Always Forward, and enter {NUMBER}.',
    other: 'Contact your carrier to set up Always Forward to {NUMBER}.',
  },
}

export function forwardingInstruction(
  mode: string | null | undefined,
  carrier: string | null | undefined,
  number: string,
  rings: number | null | undefined,
): string {
  const m = mode && FORWARDING_INSTRUCTIONS[mode] ? mode : 'full_time'
  const c = carrier && FORWARDING_INSTRUCTIONS[m][carrier] ? carrier : 'other'
  return FORWARDING_INSTRUCTIONS[m][c]
    .replace('{NUMBER}', number || 'your TalkMate number')
    .replace('{RINGS}', String(rings ?? 3))
}

// The 5 ElevenLabs voices exposed in onboarding (already in the codebase).
// Do NOT add new voices; do NOT use the website-demo voice here.
export const ONBOARDING_VOICES: { id: string; label: string; blurb: string }[] = [
  { id: 'snyKKuaGYk1VUEh42zbW', label: 'Chris', blurb: 'Friendly Aussie male' },
  { id: 'IKne3meq5aSn9XLyUdCD', label: 'Charlie', blurb: 'Casual Aussie male' },
  { id: '56bWURjYFHyYyVf490Dp', label: 'Emma', blurb: 'Warm Aussie female' },
  { id: 'cvpTJfe9LINpHIOmB2Hp', label: 'Charlotte', blurb: 'Casual Aussie female' },
  { id: 'gEdKKVxVhNCulBgRQ9GW', label: 'Charlotte Pro', blurb: 'Professional Aussie female' },
]
