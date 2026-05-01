import { NextRequest, NextResponse } from 'next/server'

// Legacy voice keys (sarah/james/emma/liam) kept for backwards compatibility
// with anything stored in older onboarding state. New keys (charlie/chris/...)
// are sourced from INDUSTRY_LIBRARY.recommendedVoiceId.
const VOICE_MAP: Record<string, string> = {
  // Legacy
  sarah: 'cvpTJfe9LINpHIOmB2Hp',
  james: 'snyKKuaGYk1VUEh42zbW',
  emma:  '56bWURjYFHyYyVf490Dp',
  liam:  'IKne3meq5aSn9XLyUdCD',
  // New (Step 4 upgrade)
  charlie:       'IKne3meq5aSn9XLyUdCD',
  chris:         'snyKKuaGYk1VUEh42zbW',
  charlotteWarm: 'cvpTJfe9LINpHIOmB2Hp',
  charlottePro:  'gEdKKVxVhNCulBgRQ9GW',
}

const SAMPLES: Record<string, string> = {
  sarah: "Hi, thank you for calling! How can I help you today? Whether it's a booking, a question, or something else — I'm here for you.",
  james: "G'day, thanks for calling. How can I help you today? Happy to help with bookings, pricing, or any questions you have.",
  emma:  "Hey there, welcome! So great that you called — how can I help you out today? Whatever you need, just let me know!",
  liam:  "Hey! Thanks for calling. What can I do for you today? Whether it's a booking or a question, I've got you covered!",
  charlie:       "Hey, thanks for calling — what do you need done?",
  chris:         "Hey, how can I help you today?",
  charlotteWarm: "Hi, how can I help you today?",
  charlottePro:  "Hi, how can I help you today?",
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Accept either a literal ElevenLabs voice ID (the new flow — Step 4 passes
// INDUSTRY_LIBRARY[key].recommendedVoiceId directly) or one of our short
// keys, and resolve to an ElevenLabs ID.
function resolveVoiceId(input: string): string {
  if (VOICE_MAP[input]) return VOICE_MAP[input]
  // ElevenLabs IDs are 20-char alphanumeric — pass through if it looks like one.
  if (/^[A-Za-z0-9]{18,32}$/.test(input)) return input
  return VOICE_MAP.charlie
}

async function synthesize(voiceParam: string, text: string) {
  const elevenLabsVoiceId = resolveVoiceId(voiceParam)

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    console.error('ElevenLabs error:', err)
    return NextResponse.json({ error: 'TTS failed' }, { status: 500 })
  }

  const audioBuffer = await response.arrayBuffer()

  return new NextResponse(audioBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Surrogate-Control': 'no-store',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    },
  })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const voiceParam = searchParams.get('voice') || 'charlie'
  const text = searchParams.get('text') || SAMPLES[voiceParam] || SAMPLES.charlie

  try {
    return await synthesize(voiceParam, text)
  } catch (err) {
    console.error('Voice preview error:', err)
    return NextResponse.json({ error: 'Failed to generate preview' }, { status: 500 })
  }
}

// POST is preferred when previewing a long, user-edited greeting (Step 4)
// because it doesn't bump up against URL length limits.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const voiceParam = (body.voice as string) || 'charlie'
    const text = (body.text as string) || SAMPLES[voiceParam] || SAMPLES.charlie
    return await synthesize(voiceParam, text)
  } catch (err) {
    console.error('Voice preview error:', err)
    return NextResponse.json({ error: 'Failed to generate preview' }, { status: 500 })
  }
}
