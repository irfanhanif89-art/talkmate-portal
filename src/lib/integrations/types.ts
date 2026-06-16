// Shared row shapes for the Day-1 integration fire helpers. These are the
// columns the fire-and-forget syncs read off `businesses` and `calls`. Kept
// deliberately small + all-optional so the Vapi webhook can pass a partial row
// without a type fight, and so adding a column never breaks a caller.

export interface IntegrationBusiness {
  id: string
  name?: string | null
  talkmate_number?: string | null

  // Zapier
  zapier_webhook_url?: string | null

  // HubSpot (tokens encrypted at rest)
  hubspot_access_token?: string | null
  hubspot_refresh_token?: string | null
  hubspot_portal_id?: string | null

  // MYOB (tokens encrypted at rest)
  myob_access_token?: string | null
  myob_refresh_token?: string | null
  myob_company_id?: string | null
}

export interface IntegrationCall {
  id: string
  caller_number?: string | null
  duration_seconds?: number | null
  outcome?: string | null
  intelligence_score?: number | null
  was_abandoned?: boolean | null
  winback_sent?: boolean | null
  transcript?: string | null
  started_at?: string | null
  ended_at?: string | null
  booking_id?: string | null
}
