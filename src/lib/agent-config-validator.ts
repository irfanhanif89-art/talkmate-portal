// Session 24 — Agent config validator.
// ----------------------------------------------------------------
// Takes a Vapi assistant JSON (response shape from
// `GET https://api.vapi.ai/assistant/{id}`) and produces a list of
// AgentIssue objects describing every deviation from the canonical
// AGENT_CONFIG_STANDARD.
//
// Two cohorts of checks:
//   1. Field-by-field equality against AGENT_CONFIG_STANDARD (uses
//      CONFIG_TOLERANCE for floats).
//   2. Prompt content scan — placeholders, dollar signs, ordinal
//      suffixes that all break ElevenLabs speech.
//
// Special rule for responseDelaySeconds: below 1.4 is critical
// (RESPONSE_DELAY_TOO_LOW), otherwise any value that isn't the
// canonical 1.6 is a warning (RESPONSE_DELAY_WRONG).
//
// The validator is forgiving about *shape* — Vapi's API returns
// nested objects (voice, model, transcriber, model.tools, ...) and
// occasionally re-shapes its response. We narrow with typeof checks
// rather than throwing on missing fields; a missing field becomes an
// AgentIssue, not a runtime error.

import {
  AGENT_CONFIG_STANDARD,
  CONFIG_TOLERANCE,
  ISSUE_DEFINITIONS,
  makeIssue,
  type AgentIssue,
} from '@/lib/agent-config-standard'

// Patterns that flag prompt content issues. Centralised here so the
// transcript-scanner shares the same definitions where applicable.
const DOLLAR_PATTERN = /\$[\d,]+/
const ORDINAL_PATTERN = /\b\d+(st|nd|rd|th)\b/i
const PLACEHOLDER_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bcalculated\s+price\b/i, label: 'calculated price' },
  { pattern: /\bcalculated\s+time\b/i,  label: 'calculated time' },
  { pattern: /\binsert\s+/i,             label: 'insert ' },
  { pattern: /\[BUSINESS/i,              label: '[BUSINESS' },
  { pattern: /\bundefined\s*[\]\)]/i,    label: 'undefined adjacent to brackets' },
  { pattern: /\bnull\s*[\]\)]/i,         label: 'null adjacent to brackets' },
]

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= CONFIG_TOLERANCE
}

function asRecord(value: unknown): Record<string, unknown> {
  return (value && typeof value === 'object') ? value as Record<string, unknown> : {}
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = parseFloat(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function asBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  return null
}

// Pull the array of tool names from the assistant. Vapi shapes have
// shifted over time — old shape was `tools: [...]` at root, current
// shape is `model.tools: [{ type, function: { name } }]`. We try both.
function extractToolNames(assistant: Record<string, unknown>): string[] {
  const collected = new Set<string>()
  const model = asRecord(assistant.model)
  const candidates: unknown[] = [
    model.tools,
    assistant.tools,
    model.functions,
    assistant.functions,
  ]
  for (const c of candidates) {
    if (!Array.isArray(c)) continue
    for (const entry of c) {
      const e = asRecord(entry)
      // function tool: { type: 'function', function: { name: '...' } }
      const fn = asRecord(e.function)
      const nameFromFn = asString(fn.name)
      if (nameFromFn) { collected.add(nameFromFn); continue }
      // direct: { name: '...' }
      const directName = asString(e.name)
      if (directName) collected.add(directName)
      // built-in tool (e.g. { type: 'transferCall', ... })
      const t = asString(e.type)
      if (t && t !== 'function') collected.add(t)
    }
  }
  return Array.from(collected)
}

function extractSystemPrompt(assistant: Record<string, unknown>): string {
  // Vapi's current shape: model.messages[0].role === 'system'
  const model = asRecord(assistant.model)
  const messages = Array.isArray(model.messages) ? model.messages : []
  for (const m of messages) {
    const msg = asRecord(m)
    if (asString(msg.role) === 'system') {
      const content = asString(msg.content)
      if (content) return content
    }
  }
  // Legacy: assistant.systemPrompt
  const legacy = asString(assistant.systemPrompt) || asString(assistant.firstMessage && (assistant.firstMessage as Record<string, unknown>).systemPrompt)
  return legacy
}

export function validateAgentConfig(assistantJson: Record<string, unknown>): AgentIssue[] {
  const issues: AgentIssue[] = []
  const std = AGENT_CONFIG_STANDARD

  // ---- voice block --------------------------------------------------
  const voice = asRecord(assistantJson.voice)
  const provider = asString(voice.provider)
  if (provider !== std.voice.provider) {
    issues.push(makeIssue('WRONG_PROVIDER', 'voice.provider', provider || null, std.voice.provider))
  }
  const voiceId = asString(voice.voiceId)
  if (voiceId !== std.voice.voiceId) {
    issues.push(makeIssue('WRONG_VOICE_ID', 'voice.voiceId', voiceId || null, std.voice.voiceId))
  }
  const voiceModel = asString(voice.model)
  if (voiceModel !== std.voice.model) {
    issues.push(makeIssue('WRONG_VOICE_MODEL', 'voice.model', voiceModel || null, std.voice.model))
  }

  const stability = asNumber(voice.stability)
  if (stability != null && stability > 0.45 + CONFIG_TOLERANCE) {
    issues.push(makeIssue('STABILITY_TOO_HIGH', 'voice.stability', stability, std.voice.stability))
  }

  const sim = asNumber(voice.similarityBoost)
  if (sim == null || !approxEqual(sim, std.voice.similarityBoost)) {
    issues.push(makeIssue('SIMILARITY_BOOST_WRONG', 'voice.similarityBoost', sim, std.voice.similarityBoost))
  }

  const styleVal = asNumber(voice.style)
  if (styleVal == null || !approxEqual(styleVal, std.voice.style)) {
    issues.push(makeIssue('STYLE_WRONG', 'voice.style', styleVal, std.voice.style))
  }

  const filler = asBool(voice.fillerInjectionEnabled)
  if (filler === true) {
    issues.push(makeIssue('FILLER_INJECTION_ON', 'voice.fillerInjectionEnabled', filler, std.voice.fillerInjectionEnabled))
  }

  const bg = asString(voice.backgroundSound)
  if (bg && bg !== 'off') {
    issues.push(makeIssue('BACKGROUND_SOUND_ON', 'voice.backgroundSound', bg, std.voice.backgroundSound))
  }

  const latency = asNumber(voice.optimizeStreamingLatency)
  if (latency != null && latency !== 0) {
    issues.push(makeIssue('STREAMING_LATENCY_WRONG', 'voice.optimizeStreamingLatency', latency, 0))
  }

  // ---- timing -------------------------------------------------------
  const responseDelay = asNumber(assistantJson.responseDelaySeconds)
  if (responseDelay == null) {
    issues.push(makeIssue('RESPONSE_DELAY_WRONG', 'responseDelaySeconds', responseDelay, std.timing.responseDelaySeconds))
  } else if (responseDelay < 1.4 - CONFIG_TOLERANCE) {
    issues.push(makeIssue('RESPONSE_DELAY_TOO_LOW', 'responseDelaySeconds', responseDelay, std.timing.responseDelaySeconds))
  } else if (!approxEqual(responseDelay, std.timing.responseDelaySeconds)) {
    issues.push(makeIssue('RESPONSE_DELAY_WRONG', 'responseDelaySeconds', responseDelay, std.timing.responseDelaySeconds))
  }

  const stop = assistantJson.stopSpeakingPlan
  if (!stop || typeof stop !== 'object') {
    issues.push(makeIssue('STOP_SPEAKING_MISSING', 'stopSpeakingPlan', stop ?? null, std.timing.stopSpeakingPlan))
  } else {
    const s = stop as Record<string, unknown>
    const numWords = asNumber(s.numWords)
    const voiceSec = asNumber(s.voiceSeconds)
    const backoffSec = asNumber(s.backoffSeconds)
    const mismatched =
      numWords !== std.timing.stopSpeakingPlan.numWords ||
      voiceSec == null || !approxEqual(voiceSec, std.timing.stopSpeakingPlan.voiceSeconds) ||
      backoffSec == null || !approxEqual(backoffSec, std.timing.stopSpeakingPlan.backoffSeconds)
    if (mismatched) {
      issues.push(makeIssue('STOP_SPEAKING_WRONG', 'stopSpeakingPlan',
        { numWords, voiceSeconds: voiceSec, backoffSeconds: backoffSec },
        std.timing.stopSpeakingPlan,
      ))
    }
  }

  // ---- transcriber --------------------------------------------------
  const transcriber = asRecord(assistantJson.transcriber)
  const tModel = asString(transcriber.model)
  if (tModel && tModel !== std.transcriber.model) {
    issues.push(makeIssue('WRONG_TRANSCRIBER_MODEL', 'transcriber.model', tModel, std.transcriber.model))
  }
  const tLang = asString(transcriber.language)
  if (tLang && tLang !== std.transcriber.language) {
    issues.push(makeIssue('WRONG_TRANSCRIBER_LANG', 'transcriber.language', tLang, std.transcriber.language))
  }
  const tEnd = asNumber(transcriber.endpointing)
  if (tEnd != null && tEnd !== std.transcriber.endpointing) {
    issues.push(makeIssue('WRONG_ENDPOINTING', 'transcriber.endpointing', tEnd, std.transcriber.endpointing))
  }

  // ---- server URL ---------------------------------------------------
  const serverUrl = asString(assistantJson.serverUrl)
    || asString(asRecord(assistantJson.server).url)
  if (serverUrl && serverUrl !== std.serverUrl) {
    issues.push(makeIssue('WRONG_SERVER_URL', 'serverUrl', serverUrl, std.serverUrl))
  }

  // ---- tools --------------------------------------------------------
  const toolNames = extractToolNames(assistantJson)
  if (toolNames.length === 0) {
    issues.push(makeIssue('NO_TOOLS', 'model.tools', toolNames, std.tools.required))
  } else {
    const present = new Set(toolNames)
    const missMap: Record<string, keyof typeof ISSUE_DEFINITIONS> = {
      create_booking:    'MISSING_CREATE_BOOKING',
      check_caller:      'MISSING_CHECK_CALLER',
      schedule_callback: 'MISSING_SCHEDULE_CALLBACK',
      log_outcome:       'MISSING_LOG_OUTCOME',
    }
    for (const required of std.tools.required) {
      if (!present.has(required)) {
        const code = missMap[required]
        if (code) {
          issues.push(makeIssue(code, `model.tools[${required}]`, null, required))
        }
      }
    }
  }

  // ---- system prompt content ---------------------------------------
  const prompt = extractSystemPrompt(assistantJson)
  if (!prompt.trim()) {
    issues.push(makeIssue('NO_SYSTEM_PROMPT', 'model.messages[0].content', prompt || null, 'non-empty system prompt'))
  } else {
    for (const { pattern, label } of PLACEHOLDER_PATTERNS) {
      const m = pattern.exec(prompt)
      if (m) {
        issues.push(makeIssue('PLACEHOLDER_IN_PROMPT', 'model.messages[0].content', `…${m[0]}…`, `no "${label}"`))
        break // one critical per prompt is enough — surface the first match
      }
    }
    const dollarMatch = DOLLAR_PATTERN.exec(prompt)
    if (dollarMatch) {
      issues.push(makeIssue('DOLLAR_SIGN_IN_PROMPT', 'model.messages[0].content', dollarMatch[0], 'spelled-out amount, e.g. "two hundred dollars"'))
    }
    const ordinalMatch = ORDINAL_PATTERN.exec(prompt)
    if (ordinalMatch) {
      issues.push(makeIssue('ORDINAL_SUFFIX_IN_PROMPT', 'model.messages[0].content', ordinalMatch[0], 'spelled-out ordinal, e.g. "the first"'))
    }
  }

  return issues
}

// Convenience: derive overall health status from the issue list.
export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown'

export function statusFromIssues(issues: AgentIssue[] | null | undefined): HealthStatus {
  if (!issues) return 'unknown'
  if (issues.some(i => i.severity === 'critical')) return 'critical'
  if (issues.length > 0) return 'warning'
  return 'healthy'
}
