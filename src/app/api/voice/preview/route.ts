import { NextRequest, NextResponse } from 'next/server'

// Map our voice IDs to ElevenLabs voice IDs — all Australian accents
const VOICE_MAP: Record<string, string> = {
  sarah: 'cvpTJfe9LINpHIOmB2Hp',  // Charlotte — Warm & Conversational, Australian Female
  james: 'snyKKuaGYk1VUEh42zbW',  // Australian Male — Friendly, Professional
  emma:  '56bWURjYFHyYyVf490Dp',  // Emma — Warm Australian Female
  liam:  'IKne3meq5aSn9XLyUdCD',  // Charlie — Deep, Confident, Energetic, Australian Male
}

const SAMPLES: Record<string, string> = {
  sarah: "Hi, thank you for calling! How can I help you today? Whether it's a booking, a question, or something else — I'm here for you.",
  james: "G'day, thanks for calling. How can I help you today? Happy to help with bookings, pricing, or any questions you have.",
  emma:  "Hey there, welcome! So great that you called — how can I help you out today? Whatever you need, just let me know!",
  liam:  "Hey! Thanks for calling. What can I do for you today? Whether it's a booking or a question, I've got you covered!",
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const voiceId = searchParams.get('voice') || 'sarah'
  const elevenLabsVoiceId = VOICE_MAP[voiceId] || VOICE_MAP.sarah
  const text = SAMPLES[voiceId] || SAMPLES.sarah

  try {
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
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
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
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    })
  } catch (err) {
    console.error('Voice preview error:', err)
    return NextResponse.json({ error: 'Failed to generate preview' }, { status: 500 })
  }
}
