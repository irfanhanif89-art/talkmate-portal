// The Grok prompt that Make.com runs against every Vapi call transcript before
// posting to /api/contacts/upsert. The exact text matches Session 1 brief Part 3
// so the JSON shape is stable and the extracted fields land in the right
// columns without further translation.

export const TAG_VOCAB = [
  'repeat_caller',
  'new_caller',
  'complaint',
  'price_enquiry',
  'booking',
  'order',
  'delivery',
  'urgent',
  'vip_potential',
  'upsell_accepted',
  'upsell_declined',
  'after_hours',
] as const

export type ExtractionTag = (typeof TAG_VOCAB)[number]

export const CONTACT_EXTRACTION_PROMPT = `You are a data extraction assistant. Given a call transcript from a business phone system, extract the following information if present in the conversation. Return ONLY valid JSON, no other text.

{
  "caller_name": "full name if the caller gave their name, null if not given",
  "caller_email": "email if mentioned, null if not",
  "call_purpose": "one sentence describing why they called",
  "call_outcome": "one of: order_placed, booking_made, enquiry_answered, callback_requested, complaint_logged, transfer_to_human, no_resolution",
  "follow_up_required": true or false,
  "tags": ["array", "of", "relevant", "tags", "from", "the", "list", "below"],
  "industry_data": {}
}

Available tags: ${TAG_VOCAB.join(', ')}

For industry_data, if you can detect the business type from context, include relevant fields:
- restaurant: { "order_items": [], "order_value": null, "order_type": "pickup/delivery/dine_in" }
- towing: { "vehicle_make": null, "vehicle_model": null, "vehicle_year": null, "breakdown_location": null, "issue_type": null }
- real_estate: { "enquiry_type": "buy/rent/sell/appraisal", "budget": null, "property_interest": null, "pre_approved": null, "suburbs": [] }
- trades: { "job_type": null, "urgency": "emergency/urgent/standard", "property_address": null }

Transcript:
{transcript}`

// Build the prompt with a transcript substituted in.
export function buildContactExtractionPrompt(transcript: string): string {
  return CONTACT_EXTRACTION_PROMPT.replace('{transcript}', transcript)
}
