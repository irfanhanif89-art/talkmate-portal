// Session 28 (H9) — builder for newly-provisioned Vapi assistants.
//
// Before this file existed, /api/onboarding/complete hand-rolled a
// minimal Vapi POST that:
//   - used voice.provider 'eleven-labs' instead of '11labs'
//   - didn't set a voice model (defaulted to whatever Vapi picked)
//   - didn't ship stopSpeakingPlan, transcriber config, or
//     responseDelaySeconds
//   - didn't register any of the function tools
//
// Result: every new client agent failed validateAgentConfig on day
// one and Donna or Irfan had to log in to Vapi and fix everything by
// hand. This builder produces a payload that passes the validator on
// the first try.

import { AGENT_CONFIG_STANDARD } from './agent-config-standard'
import { buildTool, type VapiTool } from './vapi-tool-defs'

export interface AgentBuildOptions {
  businessName: string
  businessId: string
  systemPrompt: string
  firstMessage: string
  voiceId?: string
  plan: string
  serverUrl?: string
  serverSecret?: string
  modelProvider?: string
  modelName?: string
  modelTemperature?: number
}

export interface VapiAssistantPayload {
  name: string
  firstMessage: string
  model: {
    provider: string
    model: string
    systemPrompt: string
    temperature: number
    tools: VapiTool[]
  }
  voice: {
    provider: string
    voiceId: string
    model: string
    stability: number
    similarityBoost: number
    style: number
    useSpeakerBoost: boolean
    fillerInjectionEnabled: boolean
    backgroundSound: string
    optimizeStreamingLatency: number
  }
  transcriber: {
    provider: string
    model: string
    language: string
    endpointing: number
  }
  responseDelaySeconds: number
  stopSpeakingPlan: {
    numWords: number
    voiceSeconds: number
    backoffSeconds: number
  }
  serverUrl: string
  serverUrlSecret?: string
}

// Plan → tool name list. Mirrors the sync routes.
function toolsForPlan(plan: string): string[] {
  const normalised = (plan ?? 'starter').toLowerCase()
  const std = AGENT_CONFIG_STANDARD.tools
  const base = [...std.required]
  if (normalised === 'starter') return base
  return [...base, ...std.requiredForBookings, ...std.requiredForQuoting]
}

export function buildNewAgentPayload(options: AgentBuildOptions): VapiAssistantPayload {
  const std = AGENT_CONFIG_STANDARD
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.talkmate.com.au'
  const serverUrl = options.serverUrl ?? `${appUrl}/api/vapi/functions`
  const serverSecret = options.serverSecret ?? process.env.VAPI_WEBHOOK_SECRET

  const toolNames = toolsForPlan(options.plan)
  const tools = toolNames.map(name =>
    buildTool(name, options.businessId, null, { serverUrl, serverSecret }),
  )

  return {
    name: `${options.businessName} — Talkmate Agent`,
    firstMessage: options.firstMessage,
    model: {
      provider: options.modelProvider ?? 'openai',
      model: options.modelName ?? 'gpt-4o',
      systemPrompt: options.systemPrompt,
      temperature: options.modelTemperature ?? 0.7,
      tools,
    },
    voice: {
      provider: std.voice.provider,
      voiceId: options.voiceId || std.voice.voiceId,
      model: std.voice.model,
      stability: std.voice.stability,
      similarityBoost: std.voice.similarityBoost,
      style: std.voice.style,
      useSpeakerBoost: std.voice.useSpeakerBoost,
      fillerInjectionEnabled: std.voice.fillerInjectionEnabled,
      backgroundSound: std.voice.backgroundSound,
      optimizeStreamingLatency: std.voice.optimizeStreamingLatency,
    },
    transcriber: {
      provider: std.transcriber.provider,
      model: std.transcriber.model,
      language: std.transcriber.language,
      endpointing: std.transcriber.endpointing,
    },
    responseDelaySeconds: std.timing.responseDelaySeconds,
    stopSpeakingPlan: {
      numWords: std.timing.stopSpeakingPlan.numWords,
      voiceSeconds: std.timing.stopSpeakingPlan.voiceSeconds,
      backoffSeconds: std.timing.stopSpeakingPlan.backoffSeconds,
    },
    serverUrl,
    ...(serverSecret ? { serverUrlSecret: serverSecret } : {}),
  }
}
