// Session 24 — Transcript pattern scanner.
// ----------------------------------------------------------------
// Scans a Vapi call transcript for speech patterns that indicate a
// configuration or prompt problem we can fix. Only AI/agent lines
// are scanned — the caller saying "$250" is fine, the agent saying
// "$250" causes ElevenLabs to distort the dollar amount into garble.
//
// Transcript format from Vapi:
//   "AI: Hello, GM Towing. How can I help?
//    User: I need a tow.
//    AI: Sure, what's the address?"
//
// Lines are split on \n and only those starting with "AI:" (case
// insensitive, optional whitespace after the colon) are scanned.
//
// Critical patterns trigger an immediate Telegram alert from
// score-call-async. Warnings accumulate in the transcript_violations
// table for the admin dashboard.

export type TranscriptSeverity = 'critical' | 'warning'

export interface TranscriptViolation {
  call_id: string
  business_id: string
  pattern_code: string
  severity: TranscriptSeverity
  pattern_match: string
  context_snippet: string
}

interface PatternDefinition {
  code: string
  severity: TranscriptSeverity
  pattern: RegExp
  message: string
}

export const TRANSCRIPT_PATTERNS: PatternDefinition[] = [
  {
    code: 'dollar_sign',
    severity: 'warning',
    // Match a literal $ followed by digits/commas. ElevenLabs reads
    // "$250" as garbled symbols rather than "two hundred and fifty
    // dollars" — prompts should spell out amounts.
    pattern: /\$[\d,]+/g,
    message: 'Dollar sign in agent speech — causes distortion on ElevenLabs',
  },
  {
    code: 'ordinal_suffix',
    severity: 'warning',
    // "21st", "3rd", etc. ElevenLabs glitches mid-word on the suffix.
    pattern: /\b\d+(st|nd|rd|th)\b/gi,
    message: 'Ordinal suffix in agent speech — causes glitching on ElevenLabs',
  },
  {
    code: 'placeholder_text',
    severity: 'critical',
    // Agent speaking raw prompt template variables means the
    // prompt was never compiled or a variable wasn't substituted.
    pattern: /\b(calculated price|calculated time|insert price|insert name|undefined|null)\b/gi,
    message: 'Placeholder text spoken by agent — prompt variables not populated',
  },
  {
    code: 'formula_exposed',
    severity: 'critical',
    // Agents should quote the final price, never read out the pricing
    // formula. "Two hundred and fifty dollars" — not "the base rate
    // multiplied by twenty kilometres."
    pattern: /\b(base rate|per km|multiplied by|divided by|equals total)\b/gi,
    message: 'Pricing formula logic spoken by agent — should quote final price only',
  },
  {
    code: 'talkmate_exposed',
    severity: 'critical',
    // Breaks the business-receptionist illusion. The agent is the
    // business, not "TalkMate." Match the word with optional
    // capitalisation but avoid matching it inside URLs (already
    // filtered because URLs aren't usually spoken).
    pattern: /\btalkmate\b/gi,
    message: 'Agent spoke the word TalkMate — breaks the business receptionist illusion',
  },
  {
    code: 'wrong_unit',
    severity: 'warning',
    // Containers are "20 foot" / "40 foot", not "20 feet" / "40 feet".
    pattern: /\b\d+\s?feet container\b/gi,
    message: 'Wrong unit — should be "foot" not "feet" for container sizes',
  },
]

// Extract only AI/agent lines from the transcript. Handles common
// shape variations: "AI:", "Ai:", "AI :" with extra whitespace.
function extractAgentLines(transcript: string): string {
  return transcript
    .split('\n')
    .filter(line => /^\s*AI\s*:/i.test(line))
    .join('\n')
}

export function scanTranscript(
  transcript: string,
  callId: string,
  businessId: string,
): TranscriptViolation[] {
  if (!transcript || !transcript.trim()) return []

  const agentLines = extractAgentLines(transcript)
  if (!agentLines) return []

  const violations: TranscriptViolation[] = []

  for (const pattern of TRANSCRIPT_PATTERNS) {
    // Reset lastIndex defensively — global RegExps carry state across
    // exec calls and matchAll handles this internally, but staying
    // explicit avoids surprises when this function is called in a loop.
    pattern.pattern.lastIndex = 0
    const matches = [...agentLines.matchAll(pattern.pattern)]
    for (const match of matches) {
      const idx = match.index ?? 0
      const start = Math.max(0, idx - 30)
      const end = Math.min(agentLines.length, idx + match[0].length + 30)
      violations.push({
        call_id: callId,
        business_id: businessId,
        pattern_code: pattern.code,
        severity: pattern.severity,
        pattern_match: match[0],
        context_snippet: agentLines.slice(start, end).replace(/\s+/g, ' ').trim(),
      })
    }
  }

  return violations
}

// Lookup table for human-readable labels used in admin UI + Telegram.
export const TRANSCRIPT_PATTERN_LABELS: Record<string, string> = Object.fromEntries(
  TRANSCRIPT_PATTERNS.map(p => [p.code, p.message]),
)
