// Session 24 — CANONICAL TALKMATE AGENT CONFIGURATION STANDARD
// ----------------------------------------------------------------
// Single source of truth for every valid TalkMate Vapi agent
// configuration. Every other system in the codebase that needs to
// reason about "what a healthy agent looks like" imports from this
// file. Never hardcode any of these values anywhere else.
//
// Last updated: 2026-05-21
// Trigger: May 21 audit of GM Towing + Spectrum Towing found
//   - create_booking missing from both live agents (silent fail)
//   - stability too high → voice swung between flat and excited
//   - missing stopSpeakingPlan → agent talked over callers
//   - responseDelaySeconds 0.5 on Glen → cut callers mid-sentence
//
// Deviation from these values is a configuration error.

export const AGENT_CONFIG_STANDARD = {
  voice: {
    provider: '11labs' as const,
    voiceId: 'IKne3meq5aSn9XLyUdCD',          // Charlie — Australian male
    model: 'eleven_flash_v2_5' as const,       // NEVER eleven_v3 — causes American accent
    stability: 0.38,                            // Above 0.45 swings flat ↔ excited
    similarityBoost: 0.80,
    style: 0.10,
    useSpeakerBoost: true,
    fillerInjectionEnabled: false,              // ALWAYS off — artificial ums and ahs
    backgroundSound: 'off' as const,
    optimizeStreamingLatency: 0,
  },
  timing: {
    responseDelaySeconds: 1.6,                  // Below 1.4 cuts off callers mid-sentence
    stopSpeakingPlan: {
      numWords: 3,
      voiceSeconds: 0.3,
      backoffSeconds: 2,
    },
  },
  transcriber: {
    provider: 'deepgram' as const,
    model: 'nova-3' as const,
    language: 'en-AU' as const,
    endpointing: 500,
  },
  tools: {
    // These tool names must be present in every production agent
    required: ['check_caller', 'create_booking', 'schedule_callback', 'log_outcome'],
    // These are required for towing agents specifically
    requiredForTowing: ['calculate_job_quote', 'check_availability', 'transferCall'],
  },
  serverUrl: 'https://app.talkmate.com.au/api/vapi/functions',
} as const

// Tolerance for floating point comparisons (Vapi sometimes round-trips
// floats through JSON and re-emits them as 0.38000000000001).
export const CONFIG_TOLERANCE = 0.001

// Issue severity levels
export type IssueSeverity = 'critical' | 'warning'

export interface AgentIssue {
  code: string
  severity: IssueSeverity
  message: string
  field: string
  expected: unknown
  actual: unknown
}

// All known issue codes and their meanings. The validator reads this
// table so adding a new issue is a single-place change — message and
// severity stay together.
export const ISSUE_DEFINITIONS: Record<string, { severity: IssueSeverity; message: string }> = {
  WRONG_VOICE_MODEL:        { severity: 'critical', message: 'Voice model is not eleven_flash_v2_5 — American accent will appear on all calls' },
  WRONG_VOICE_ID:           { severity: 'critical', message: 'Voice ID is not Charlie — wrong voice will be used' },
  WRONG_PROVIDER:           { severity: 'critical', message: 'Voice provider is not 11labs' },
  STABILITY_TOO_HIGH:       { severity: 'warning',  message: 'Stability above 0.45 — voice swings dramatically between flat and excited' },
  SIMILARITY_BOOST_WRONG:   { severity: 'warning',  message: 'Similarity boost is not 0.80' },
  STYLE_WRONG:              { severity: 'warning',  message: 'Style exaggeration is not 0.10' },
  FILLER_INJECTION_ON:      { severity: 'warning',  message: 'Filler injection is enabled — adds artificial ums and ahs' },
  BACKGROUND_SOUND_ON:      { severity: 'warning',  message: 'Background sound is not off — caller hears fake office noise' },
  STREAMING_LATENCY_WRONG:  { severity: 'warning',  message: 'optimizeStreamingLatency is not 0 — voice quality may drop mid-call' },
  RESPONSE_DELAY_TOO_LOW:   { severity: 'critical', message: 'responseDelaySeconds below 1.4 — agent cuts off callers mid-sentence' },
  RESPONSE_DELAY_WRONG:     { severity: 'warning',  message: 'responseDelaySeconds is not 1.6' },
  STOP_SPEAKING_MISSING:    { severity: 'critical', message: 'stopSpeakingPlan not set — no interruption control, agent talks over callers' },
  STOP_SPEAKING_WRONG:      { severity: 'warning',  message: 'stopSpeakingPlan values do not match standard (numWords=3, voiceSeconds=0.3, backoffSeconds=2)' },
  NO_TOOLS:                 { severity: 'critical', message: 'No tools registered — agent cannot book jobs, send SMS, or perform any actions' },
  MISSING_CREATE_BOOKING:   { severity: 'critical', message: 'create_booking tool not registered — bookings silently fail on every call' },
  MISSING_CHECK_CALLER:     { severity: 'warning',  message: 'check_caller tool not registered — no VIP lookup or caller history' },
  MISSING_SCHEDULE_CALLBACK:{ severity: 'warning',  message: 'schedule_callback tool not registered — callback requests cannot be logged' },
  MISSING_LOG_OUTCOME:      { severity: 'warning',  message: 'log_outcome tool not registered — call outcomes not logged' },
  WRONG_TRANSCRIBER_MODEL:  { severity: 'warning',  message: 'Transcriber model is not Deepgram nova-3' },
  WRONG_TRANSCRIBER_LANG:   { severity: 'warning',  message: 'Transcriber language is not en-AU' },
  WRONG_ENDPOINTING:        { severity: 'warning',  message: 'Transcriber endpointing is not 500ms' },
  WRONG_SERVER_URL:         { severity: 'warning',  message: 'serverUrl does not point to https://app.talkmate.com.au/api/vapi/functions' },
  NO_SYSTEM_PROMPT:         { severity: 'critical', message: 'System prompt is empty or missing from both model.systemPrompt and model.messages[0].content' },
  PLACEHOLDER_IN_PROMPT:    { severity: 'critical', message: 'Placeholder text found in system prompt — agent will speak raw template variables' },
  DOLLAR_SIGN_IN_PROMPT:    { severity: 'warning',  message: 'Dollar sign found in system prompt — causes speech distortion on dollar amounts' },
  ORDINAL_SUFFIX_IN_PROMPT: { severity: 'warning',  message: 'Ordinal suffix (st/nd/rd/th) found in system prompt — causes speech glitching' },
}

// Helper: build a typed AgentIssue from a code + field + actual value.
// Keeps callers from having to repeat the definition lookup.
export function makeIssue(
  code: keyof typeof ISSUE_DEFINITIONS,
  field: string,
  actual: unknown,
  expected: unknown,
): AgentIssue {
  const def = ISSUE_DEFINITIONS[code]
  return {
    code,
    severity: def.severity,
    message: def.message,
    field,
    expected,
    actual,
  }
}
