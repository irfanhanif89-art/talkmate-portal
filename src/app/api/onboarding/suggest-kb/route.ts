// Session 4A (Round 1) — AI knowledge-base suggestions.
// SAFETY: returns suggestions only. Writes nothing. The owner accepts entries
// in Step 0B / the wizard, which is what persists them.

import { NextResponse } from 'next/server'
import { resolveBusinessId } from '@/lib/resolve-business'
import { grokJson } from '@/lib/grok'

export const runtime = 'nodejs'

interface Suggestion {
  category: 'faq' | 'service' | 'hours' | 'pricing' | 'custom'
  question: string
  answer: string
}

export async function POST(req: Request) {
  const url = new URL(req.url)
  const adminClientId = url.searchParams.get('adminClientId')
  const resolved = await resolveBusinessId(adminClientId, req)
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  let body: { industry?: string; description?: string; businessName?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  const industry = (body.industry ?? 'other').trim()
  const description = (body.description ?? '').trim()
  const businessName = (body.businessName ?? 'the business').trim()
  if (!description) return NextResponse.json({ error: 'description required' }, { status: 400 })

  try {
    const data = await grokJson<{ suggestions?: Suggestion[] } | Suggestion[]>([
      {
        role: 'system',
        content:
          'You write knowledge-base entries for an Australian small business AI receptionist. ' +
          'Use casual Australian English. Answers are 1-3 sentences, specific and helpful, sounding like the owner wrote them. ' +
          'Never use em dashes. Never invent specific prices unless given in the description. Return ONLY JSON.',
      },
      {
        role: 'user',
        content:
          `Generate 15 knowledge base entries for an Australian ${industry} business called ${businessName}. ` +
          `Business description: ${description}\n\n` +
          `Include roughly: 5 faq, 4 service, 2 hours, 2 pricing, 2 custom.\n` +
          `Return JSON: {"suggestions":[{"category":"faq"|"service"|"hours"|"pricing"|"custom","question":string,"answer":string}]}`,
      },
    ], { maxTokens: 2048 })

    const suggestions = Array.isArray(data) ? data : (data.suggestions ?? [])
    const cleaned = suggestions
      .filter(s => s && s.question?.trim() && s.answer?.trim())
      .map(s => ({
        category: (['faq', 'service', 'hours', 'pricing', 'custom'].includes(s.category) ? s.category : 'custom') as Suggestion['category'],
        question: s.question.trim(),
        answer: s.answer.trim().replace(/—/g, ', '),
      }))
    return NextResponse.json({ suggestions: cleaned })
  } catch (e) {
    return NextResponse.json({ error: 'generation failed', detail: (e as Error).message }, { status: 502 })
  }
}
