// Session 28 (H10) — single source of truth for Vapi function-tool
// definitions and the builders both sync routes use to assemble a tool
// from a template + business id.
//
// Before this file existed, /api/vapi/sync and /api/admin/vapi/sync
// both kept their own copy of TOOL_DEFS. They drifted slightly: a few
// description strings shortened in the admin copy, no structural
// differences. This module canonicalises on the longer descriptions
// from the client route. If the two ever diverge on structure
// (properties / required arrays / enums) in the future, fix the
// divergence here — don't reintroduce a parallel definition.

export interface ToolDef {
  description: string
  properties: Record<string, unknown>
  required: string[]
}

export interface VapiToolFunction {
  name?: string
  description?: string
  parameters?: Record<string, unknown>
}

export interface VapiTool {
  type?: string
  function?: VapiToolFunction
  server?: { url?: string; secret?: string } | null
  name?: string
  description?: string
  parameters?: Record<string, unknown>
  serverUrl?: string
  serverUrlSecret?: string
  [k: string]: unknown
}

export const TOOL_DEFS: Record<string, ToolDef> = {
  check_caller: {
    description: 'Look up an incoming caller by phone to surface VIP status, prior history, and repeat-caller flags. Call this once at the very start of every call before greeting.',
    properties: {
      phone: { type: 'string', description: "The caller's phone number in E.164 or local format" },
    },
    required: ['phone'],
  },
  log_outcome: {
    description: 'Log the outcome of the current call so the portal can update analytics and CRM records.',
    properties: {
      call_id: { type: 'string', description: "The current Vapi call id (e.g. 'call_xxx')" },
      outcome: { type: 'string', description: 'Short outcome label, e.g. transferred, message_taken, booking_created, callback_scheduled' },
      transfer_to: { type: 'string', description: 'Name or role of the team member the call was transferred to, if any' },
      transfer_success: { type: 'boolean', description: 'Whether the transfer actually connected' },
      summary: { type: 'string', description: 'One-sentence summary of what the caller wanted' },
    },
    required: ['call_id'],
  },
  get_team: {
    description: 'Fetch the active team members so the assistant can transfer a caller to the right person. Optionally pass a `query` to bias ordering by name, role, or department.',
    properties: {
      query: { type: 'string', description: "Optional search hint, e.g. 'accountant' or 'Sarah'" },
    },
    required: [],
  },
  schedule_callback: {
    description: 'Schedule a callback for a caller who could not be helped right now.',
    properties: {
      caller_name: { type: 'string', description: "Caller's name" },
      caller_phone: { type: 'string', description: "Caller's phone number" },
      preferred_time: { type: 'string', description: "Caller's preferred callback time (free text or ISO timestamp)" },
      reason: { type: 'string', description: 'Why the caller wants a callback' },
      call_id: { type: 'string', description: 'The current Vapi call id, if available' },
    },
    required: ['caller_phone'],
  },
  calculate_job_quote: {
    description: 'Calculate a job quote based on pickup and dropoff addresses, truck type, and customer rate type. Call this after confirming the customer type (account or retail) and collecting both addresses.',
    properties: {
      pickup_address: { type: 'string', description: 'The full pickup address as given by the caller' },
      dropoff_address: { type: 'string', description: 'The full dropoff address as given by the caller' },
      truck_type: {
        type: 'string',
        enum: ['loaded_tilt_tray', 'empty_tilt_tray', 'sideloader_40ft'],
        description: 'The type of truck required for the job',
      },
      rate_type: {
        type: 'string',
        enum: ['account', 'retail'],
        description: 'account for trade/account customers, retail for private customers',
      },
      caller_phone: { type: 'string', description: "The caller's phone number" },
      call_id: { type: 'string', description: 'The Vapi call ID for this call' },
    },
    required: ['pickup_address', 'dropoff_address', 'truck_type', 'rate_type'],
  },
  log_quote_addon: {
    description: 'Append an add-on (waiting time, toll, door direction change, futile trip) to an existing quote and return the updated total. Call this for each add-on the caller confirms after the initial quote.',
    properties: {
      quote_id: { type: 'string', description: 'The quote id returned by calculate_job_quote' },
      addon_name: { type: 'string', description: 'The exact name of the add-on as it appears in the services list (e.g. "Waiting Time - Loaded Tilt Tray")' },
      quantity: { type: 'number', description: 'Units of the add-on. Defaults to 1.' },
    },
    required: ['quote_id', 'addon_name'],
  },
  check_availability: {
    description: 'Check if the requested date and time has an available slot. Always call this before create_booking when the caller proposes a specific date or time.',
    properties: {
      date: { type: 'string', description: 'The day requested. Accepts ISO date (YYYY-MM-DD) or natural language like "tomorrow".' },
      time: { type: 'string', description: 'The time of day requested, e.g. "9am", "2:30pm", "14:30".' },
      duration_minutes: { type: 'number', description: 'Optional. Estimated duration of the job. Defaults to the business default.' },
    },
    required: ['date', 'time'],
  },
  add_to_waitlist: {
    description: 'Add the caller to the waitlist when no slot is available. Offer this only after check_availability says no slots fit. The caller is SMS’d immediately when a slot opens.',
    properties: {
      caller_phone: { type: 'string', description: "Caller's phone number" },
      caller_name: { type: 'string', description: "Caller's name" },
      requested_date: { type: 'string', description: 'Preferred date if the caller has one' },
      truck_type: { type: 'string', description: 'Truck type if relevant' },
      pickup_address: { type: 'string', description: 'Pickup address if relevant' },
      dropoff_address: { type: 'string', description: 'Dropoff address if relevant' },
      description: { type: 'string', description: 'Short description of the job' },
      call_id: { type: 'string', description: 'The current Vapi call id' },
    },
    required: ['caller_phone'],
  },
  cancel_booking: {
    description: 'Cancel an existing booking. Find the booking by booking_id, or by caller_phone plus the original scheduled_start.',
    properties: {
      booking_id: { type: 'string', description: 'The booking id to cancel, if known.' },
      caller_phone: { type: 'string', description: "Caller's phone number, used to look up the booking if booking_id is not known." },
      scheduled_start: { type: 'string', description: 'Original start timestamp, used to disambiguate when a caller has multiple bookings.' },
      cancellation_reason: { type: 'string', description: 'Optional reason the caller gave.' },
    },
    required: [],
  },
  reschedule_booking: {
    description: 'Move an existing booking to a new date and time. Find it by booking_id, or by caller_phone + scheduled_start. Always confirm availability of the new slot before saying yes.',
    properties: {
      booking_id: { type: 'string', description: 'The booking id to move, if known.' },
      caller_phone: { type: 'string', description: "Caller's phone number, used to look up the booking if booking_id is not known." },
      scheduled_start: { type: 'string', description: 'Original start timestamp, used to disambiguate.' },
      new_date: { type: 'string', description: 'The new requested date.' },
      new_time: { type: 'string', description: 'The new requested time of day.' },
    },
    required: ['new_date', 'new_time'],
  },
  create_booking: {
    description: 'Create a confirmed booking after the caller has agreed to the time, date, and job details. Call this only after check_availability confirms the slot is available.',
    properties: {
      caller_name: { type: 'string', description: 'Full name of the caller' },
      caller_phone: { type: 'string', description: 'Caller phone number' },
      pickup_address: { type: 'string', description: 'Full pickup address' },
      dropoff_address: { type: 'string', description: 'Full dropoff address' },
      pickup_contact_name: { type: 'string', description: 'Name of person at pickup' },
      pickup_contact_phone: { type: 'string', description: 'Phone of person at pickup' },
      dropoff_contact_name: { type: 'string', description: 'Name of person at dropoff' },
      dropoff_contact_phone: { type: 'string', description: 'Phone of person at dropoff' },
      truck_type: { type: 'string', enum: ['loaded_tilt_tray', 'empty_tilt_tray', 'sideloader_40ft'], description: 'Truck type required' },
      rate_type: { type: 'string', enum: ['account', 'retail'], description: 'account for trade clients, retail otherwise' },
      scheduled_date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
      scheduled_time: { type: 'string', description: 'Time in HH:MM 24-hour format' },
      description: { type: 'string', description: 'Any additional job notes' },
      account_id: { type: 'string', description: 'UUID of account if caller is an account client' },
      driver_id: { type: 'string', description: 'UUID of assigned driver if known' },
      call_id: { type: 'string', description: 'Vapi call ID for this call' },
    },
    required: ['caller_name', 'caller_phone', 'scheduled_date', 'scheduled_time'],
  },
  // Sessions 36-37 — dispatcher integration. Synced into the agent
  // only when businesses.dispatch_enabled is true. The agent calls
  // this immediately after create_booking on dispatch-enabled clients
  // so a tow booking lands as a dispatch_jobs row and the runtime
  // auto-offers it to a driver. Caller does not see the hand-off.
  create_dispatch_job: {
    description: 'After a tow booking is created on a dispatch-enabled business, call this to hand the job to the dispatcher. The dispatch system will auto-offer it to an available driver. Do not mention this to the caller.',
    properties: {
      job_type: {
        type: 'string',
        enum: ['tow', 'roadside', 'accident_recovery', 'impound_release', 'winch', 'battery_jump', 'tyre_change', 'fuel_delivery', 'lockout', 'other'],
        description: 'Type of dispatch job',
      },
      pickup_address: { type: 'string', description: 'Full pickup address' },
      pickup_notes: { type: 'string', description: 'On-scene context (lane, hazards, car in water, keys in vehicle, etc.)' },
      dropoff_address: { type: 'string', description: 'Full dropoff address, if known' },
      customer_name: { type: 'string', description: "Customer's name" },
      customer_phone: { type: 'string', description: "Customer's phone number for driver-arrival SMS" },
      vehicle_make: { type: 'string', description: 'Vehicle make if mentioned' },
      vehicle_model: { type: 'string', description: 'Vehicle model if mentioned' },
      vehicle_year: { type: 'string', description: 'Vehicle year if mentioned' },
      vehicle_colour: { type: 'string', description: 'Vehicle colour if mentioned' },
      vehicle_rego: { type: 'string', description: 'Vehicle registration if mentioned' },
      special_instructions: { type: 'string', description: 'Anything the driver needs to know (needs flatbed, no keys, etc.)' },
      truck_type_required: { type: 'string', description: 'Required truck type for matching, if known (flatbed, hook_chain, wheel_lift, heavy_recovery)' },
      payment_type: {
        type: 'string',
        enum: ['cash', 'card', 'account', 'insurance', 'motor_club', 'other'],
        description: 'Payment method, if discussed',
      },
      quoted_amount: { type: 'number', description: 'Quoted price, if a quote was given on the call' },
      booking_id: { type: 'string', description: 'UUID of the related booking (returned by create_booking)' },
      call_id: { type: 'string', description: 'Vapi call ID for this call' },
    },
    required: ['job_type', 'pickup_address'],
  },
}

// True when the existing check_caller template (cloned from a live
// agent) uses the wrapped `{ function_name, business_id, params }`
// parameter shape. New agents from the builder do NOT wrap.
export function wrapsParams(template: VapiTool | null): boolean {
  const params = (template?.function?.parameters ?? template?.parameters) as Record<string, unknown> | undefined
  const properties = params?.properties as Record<string, unknown> | undefined
  return !!(properties && 'function_name' in properties && 'business_id' in properties && 'params' in properties)
}

export function toolName(tool: VapiTool | null | undefined): string | null {
  if (!tool) return null
  return tool.function?.name ?? tool.name ?? null
}

export function buildParameters(
  functionName: string,
  businessId: string,
  template: VapiTool | null,
): Record<string, unknown> {
  const def = TOOL_DEFS[functionName]
  if (!def) throw new Error(`Unknown Vapi tool: ${functionName}`)
  if (wrapsParams(template)) {
    return {
      type: 'object',
      properties: {
        function_name: { type: 'string', enum: [functionName], description: `Always set to "${functionName}"` },
        business_id: { type: 'string', enum: [businessId], description: 'Always pass the business id baked into this tool' },
        params: {
          type: 'object',
          properties: def.properties,
          required: def.required,
        },
      },
      required: ['function_name', 'business_id', 'params'],
    }
  }
  return {
    type: 'object',
    properties: def.properties,
    required: def.required,
  }
}

export function buildTool(
  functionName: string,
  businessId: string,
  template: VapiTool | null,
  defaults: { serverUrl: string; serverSecret: string | undefined },
): VapiTool {
  const def = TOOL_DEFS[functionName]
  if (!def) throw new Error(`Unknown Vapi tool: ${functionName}`)
  const parameters = buildParameters(functionName, businessId, template)

  const base: VapiTool = template
    ? JSON.parse(JSON.stringify(template))
    : {
        type: 'function',
        server: { url: defaults.serverUrl, secret: defaults.serverSecret },
      }

  if (base.server || (base.serverUrl == null && base.serverUrlSecret == null)) {
    base.server = {
      url: base.server?.url ?? defaults.serverUrl,
      secret: base.server?.secret ?? defaults.serverSecret,
    }
  }

  base.type = base.type ?? 'function'
  base.function = {
    name: functionName,
    description: def.description,
    parameters,
  }
  if (base.name !== undefined) base.name = functionName

  return base
}
