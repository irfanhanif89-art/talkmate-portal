// Sessions 36-37 — shared types for dispatch jobs. Mirrors the
// migration 048 schema. Used by both driver and dispatcher routes.

export type DispatchJobStatus =
  | 'created'
  | 'driver_notified'
  | 'accepted'
  | 'declined'
  | 'en_route'
  | 'on_scene'
  | 'loaded'
  | 'in_transit'
  | 'at_dropoff'
  | 'completed'
  | 'invoiced'
  | 'paid'
  | 'cancelled'

export type JobType =
  | 'tow'
  | 'roadside'
  | 'accident_recovery'
  | 'impound_release'
  | 'winch'
  | 'battery_jump'
  | 'tyre_change'
  | 'fuel_delivery'
  | 'lockout'
  | 'other'

export type PaymentType =
  | 'cash'
  | 'card'
  | 'account'
  | 'insurance'
  | 'motor_club'
  | 'other'

export type PhotoType = 'pickup' | 'delivery' | 'damage' | 'other'

export const ACTIVE_DRIVER_STATUSES: readonly DispatchJobStatus[] = [
  'driver_notified',
  'accepted',
  'en_route',
  'on_scene',
  'loaded',
  'in_transit',
  'at_dropoff',
]

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  tow: 'Tow',
  roadside: 'Roadside assist',
  accident_recovery: 'Accident recovery',
  impound_release: 'Impound release',
  winch: 'Winch recovery',
  battery_jump: 'Battery jump',
  tyre_change: 'Tyre change',
  fuel_delivery: 'Fuel delivery',
  lockout: 'Lockout',
  other: 'Other',
}

export const STATUS_LABEL: Record<DispatchJobStatus, string> = {
  created: 'Created',
  driver_notified: 'Awaiting driver response',
  accepted: 'Accepted',
  declined: 'Declined',
  en_route: 'En route to pickup',
  on_scene: 'On scene',
  loaded: 'Vehicle loaded',
  in_transit: 'In transit to dropoff',
  at_dropoff: 'At dropoff',
  completed: 'Completed',
  invoiced: 'Invoiced',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

// Forward-only state transitions a driver can perform via the
// /api/driver/jobs/[id]/status endpoint. Map: current → next allowed.
export const DRIVER_FORWARD_TRANSITIONS: Partial<Record<DispatchJobStatus, DispatchJobStatus[]>> = {
  accepted: ['en_route'],
  en_route: ['on_scene'],
  on_scene: ['loaded'],
  loaded: ['in_transit'],
  in_transit: ['at_dropoff'],
  at_dropoff: ['completed'],
}

export interface DispatchJobRow {
  id: string
  client_id: string
  driver_id: string | null
  booking_id: string | null
  call_id: string | null

  job_type: JobType
  job_number: string | null
  status: DispatchJobStatus
  dispatch_attempt: number
  declined_driver_ids: string[]

  pickup_address: string
  pickup_lat: number | string | null
  pickup_lng: number | string | null
  pickup_notes: string | null
  dropoff_address: string | null
  dropoff_lat: number | string | null
  dropoff_lng: number | string | null
  dropoff_notes: string | null

  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null

  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_year: string | null
  vehicle_colour: string | null
  vehicle_rego: string | null
  vehicle_condition: string | null

  special_instructions: string | null
  truck_type_required: string | null
  distance_km: number | string | null
  estimated_duration_mins: number | null
  payment_type: PaymentType | null
  insurance_claim_number: string | null
  motor_club_job_number: string | null
  quoted_amount: number | string | null

  notified_at: string | null
  response_deadline: string | null
  accepted_at: string | null
  driver_eta_mins: number | null
  en_route_at: string | null
  on_scene_at: string | null
  loaded_at: string | null
  in_transit_at: string | null
  at_dropoff_at: string | null
  completed_at: string | null
  cancelled_at: string | null

  driver_completion_notes: string | null
  actual_distance_km: number | string | null
  final_amount: number | string | null
  payment_collected: boolean
  payment_collected_at: string | null
  payment_collected_type: PaymentType | null

  customer_sms_accepted: boolean
  customer_sms_en_route: boolean
  customer_sms_completed: boolean

  pickup_signature_url: string | null
  pickup_signature_at: string | null
  delivery_signature_url: string | null
  delivery_signature_at: string | null
  pickup_photo_count: number
  delivery_photo_count: number

  created_at: string
  updated_at: string
}

export interface DispatchJobPhotoRow {
  id: string
  dispatch_job_id: string
  driver_id: string | null
  photo_url: string
  photo_type: PhotoType
  caption: string | null
  taken_at: string
}
