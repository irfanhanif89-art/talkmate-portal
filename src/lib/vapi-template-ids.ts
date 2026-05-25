// Vapi template assistant IDs for the sales-side Demo Launcher.
// One assistant per industry, all pre-built by Donna. The Demo Launcher
// PATCHes the demo phone number's assistantId to one of these so the
// rep can instantly demo the right vertical's voice + scripts.
//
// FORBIDDEN_DEMO_PHONE_IDS is the safety allowlist: if the configured
// VAPI_DEMO_PHONE_NUMBER_ID is in this set, the launch-demo route
// refuses to PATCH (prevents accidentally repointing a live client
// number at a demo template).

export const VAPI_TEMPLATE_IDS: Record<string, string> = {
  towing:       'e0190f41-a823-4670-8006-ea94177210f1',
  restaurants:  'd5387089-69cc-42ec-8e79-eac7fd8b3ad1',
  real_estate:  'b3bd0d3e-94a0-4a2d-ac6f-62527015761b',
  trades:       'bd4c35c6-fb4e-4db1-b98c-1a940006d944',
  healthcare:   'd63824ea-9d48-47a2-818f-4ea09242f176',
  plumbing:     '0a6243e5-aecb-4a61-ab06-4d3d78294c50',
  electrical:   '8e2997e1-e5df-4b46-8198-d3864dac20ca',
  hvac:         '39f0a103-bae3-44f6-b31f-4a403d3bf606',
  ndis:         '44d456b4-818b-46f4-b1b0-20291dd62eab',
  retail:       '86467627-ef25-4407-b587-b3c9b3d27a0c',
  professional: '42867df8-7452-4feb-bf07-1eb1951c780e',
  beauty:       '8b0aeef0-5a92-466c-a73f-d124c4202d63',
  gym:          '9b843e6d-3b31-4b6b-ac36-5e4ef09d4edf',
  auto:         '1420f963-0bc9-4254-bf6a-90f876d37f87',
}

export const FORBIDDEN_DEMO_PHONE_IDS = new Set<string>([
  '1b87ecc7-46d7-47f6-bacd-deba6daec770',
])
