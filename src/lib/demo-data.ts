// Demo data for the Proxima real-estate showcase (Session 3 brief Part 5).
// Phone numbers all start with +6141200100x so we can detect demo state and
// safely reset.

export const DEMO_PHONE_PREFIX = '+61412001'

export interface DemoContact {
  name: string
  phone: string
  call_count: number
  tags: string[]
  industry_data: Record<string, unknown>
  pipeline_stage: string  // matches PIPELINE_STAGES.real_estate stage names
  call_summaries: string[]  // 2–3 lines per contact for the timeline
}

export const DEMO_CONTACTS: DemoContact[] = [
  {
    name: 'Sarah Mitchell', phone: '+61412001001', call_count: 3,
    tags: ['repeat_caller', 'hot_lead'],
    industry_data: { enquiry_type: 'buy', budget: 950000, pre_approved: true, suburbs: ['Burleigh Heads', 'Miami'], property_interest: '4 bed family home' },
    pipeline_stage: 'Inspection Booked',
    call_summaries: [
      'First enquiry — pre-approved $950k, looking Burleigh Heads / Miami, four bedrooms.',
      'Asked about Norfolk Avenue listing. Booked Saturday inspection.',
      'Confirmed inspection time, asked about school catchments.',
    ],
  },
  {
    name: 'James Chen', phone: '+61412001002', call_count: 1,
    tags: ['new_caller'],
    industry_data: { enquiry_type: 'buy', budget: 750000, pre_approved: false, suburbs: ['Varsity Lakes'], property_interest: 'townhouse or unit' },
    pipeline_stage: 'Qualified',
    call_summaries: [
      'New enquiry — Varsity Lakes, $750k budget, not yet pre-approved. Asked for a broker recommendation.',
    ],
  },
  {
    name: 'Christina Papadopoulos', phone: '+61412001003', call_count: 2,
    tags: ['repeat_caller'],
    industry_data: { enquiry_type: 'buy', budget: 1200000, pre_approved: true, suburbs: ['Broadbeach', 'Mermaid Beach'], property_interest: 'ocean views, 3 bed minimum' },
    pipeline_stage: 'Inspection Booked',
    call_summaries: [
      'Pre-approved up to $1.2M, ocean views non-negotiable.',
      'Booked Saturday inspection at Hedges Avenue.',
    ],
  },
  {
    name: 'Mark Davidson', phone: '+61412001004', call_count: 1,
    tags: ['price_enquiry'],
    industry_data: { enquiry_type: 'sell', property_interest: '42 Palm Avenue Burleigh' },
    pipeline_stage: 'New Enquiry',
    call_summaries: [
      'Owner of 42 Palm Avenue Burleigh, asking about market appraisal. Wants a callback.',
    ],
  },
  {
    name: 'Emma Thompson', phone: '+61412001005', call_count: 4,
    tags: ['repeat_caller', 'vip_potential'],
    industry_data: { enquiry_type: 'buy', budget: 850000, pre_approved: true, suburbs: ['Palm Beach'], property_interest: 'beachside, no stairs' },
    pipeline_stage: 'Inspection Booked',
    call_summaries: [
      'Pre-approved $850k, must be beachside, no stairs (mobility).',
      'Inspected 18 Jefferson Lane — too steep on the access.',
      'Asked about new listings at Pacific Avenue. Inspection pending.',
      'Confirmed inspection Saturday at Pacific Avenue, asked about parking.',
    ],
  },
  {
    name: null as unknown as string, phone: '+61412001006', call_count: 1,
    tags: ['new_caller', 'after_hours'],
    industry_data: { enquiry_type: 'rent', property_interest: '2 bed apartment Surfers Paradise' },
    pipeline_stage: 'New Enquiry',
    call_summaries: [
      'After-hours enquiry — looking to rent a 2 bed in Surfers. Did not leave a name. Email pending.',
    ],
  },
  {
    name: 'David Nguyen', phone: '+61412001007', call_count: 2,
    tags: ['repeat_caller'],
    industry_data: { enquiry_type: 'buy', budget: 680000, pre_approved: true, suburbs: ['Robina', 'Varsity Lakes'] },
    pipeline_stage: 'Qualified',
    call_summaries: [
      'Pre-approved $680k, considering Robina or Varsity Lakes. Asked about body corporate fees on units.',
      'Followed up on the Robina townhouse. Open to inspection.',
    ],
  },
  {
    name: 'Lisa Park', phone: '+61412001008', call_count: 1,
    tags: ['complaint'],
    industry_data: { enquiry_type: 'buy', budget: 900000 },
    pipeline_stage: 'Lost',
    call_summaries: [
      'Complaint — felt agent was unresponsive on a previous offer. Has gone with another agency.',
    ],
  },
  {
    name: 'Tom Bradley', phone: '+61412001009', call_count: 3,
    tags: ['repeat_caller'],
    industry_data: { enquiry_type: 'buy', budget: 1500000, pre_approved: true, suburbs: ['Sanctuary Cove', 'Hope Island'] },
    pipeline_stage: 'Offer Made',
    call_summaries: [
      'Pre-approved $1.5M — Hope Island and Sanctuary Cove. Wants waterfront.',
      'Inspected the Sanctuary Cove villa — impressed.',
      'Submitted an offer at $1.45M. Awaiting vendor response.',
    ],
  },
  {
    name: 'Rachel Kim', phone: '+61412001010', call_count: 1,
    tags: ['booking'],
    industry_data: { enquiry_type: 'buy', budget: 790000, pre_approved: false, suburbs: ['Helensvale'] },
    pipeline_stage: 'Qualified',
    call_summaries: [
      'New buyer, Helensvale focus, $790k. Booked an introductory consultation for next Tuesday.',
    ],
  },
]
