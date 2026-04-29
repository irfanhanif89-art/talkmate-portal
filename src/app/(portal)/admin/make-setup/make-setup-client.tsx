'use client'

import { useState } from 'react'
import { Webhook, Sparkles, Send, ArrowRight, Copy, Check } from 'lucide-react'

interface Props { baseUrl: string }

export default function MakeSetupClient({ baseUrl }: Props) {
  const [testResult, setTestResult] = useState<{ ok: boolean; data?: unknown; error?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const upsertUrl = `${baseUrl}/api/contacts/upsert`
  const testUrl = `${baseUrl}/api/contacts/upsert/test`

  async function runTest() {
    setBusy(true); setTestResult(null)
    try {
      const res = await fetch('/api/contacts/upsert/test', { method: 'GET' })
      const data = await res.json()
      setTestResult({ ok: data.ok === true, data })
    } catch (e) {
      setTestResult({ ok: false, error: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(c => (c === key ? null : c)), 2000)
    })
  }

  const card = {
    background: '#0A1E38', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14, padding: 22, marginBottom: 18,
  } as const

  const codeBox = {
    background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 9, padding: 14, fontFamily: 'monospace', fontSize: 12,
    color: '#A5B4C9', overflowX: 'auto' as const, lineHeight: 1.6, whiteSpace: 'pre' as const,
  } as const

  const samplePayload = JSON.stringify({
    client_id: '<businesses.id from existing call-logging step>',
    phone: '+61412345678',
    call_id: '<vapi call id>',
    call_at: '2026-04-29T10:30:00Z',
    duration_seconds: 127,
    transcript: '<full transcript>',
    summary: '<call_purpose from extraction>',
    extracted_name: 'John',
    extracted_email: null,
    outcome: 'order_placed',
    tags: ['new_caller', 'order'],
    industry_data: {
      order_items: ['large fish and chips', 'garlic bread'],
      order_value: 26.0,
      order_type: 'pickup',
    },
  }, null, 2)

  return (
    <>
      {/* Flow diagram */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 14 }}>Scenario flow</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {[
            { icon: Webhook, label: 'Vapi end-of-call webhook', sub: 'trigger' },
            { icon: Sparkles, label: 'Grok extraction', sub: 'HTTP request module' },
            { icon: Send, label: 'POST /api/contacts/upsert', sub: 'TalkMate' },
          ].map((s, i, arr) => {
            const Icon = s.icon
            return (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  background: 'rgba(232,98,42,0.08)', border: '1px solid rgba(232,98,42,0.3)',
                  borderRadius: 11, padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 10, minWidth: 200,
                }}>
                  <Icon size={18} color="#E8622A" />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'white' }}>Step {i + 1}</div>
                    <div style={{ fontSize: 12, color: '#7BAED4' }}>{s.label}</div>
                    <div style={{ fontSize: 10, color: '#4A7FBB', marginTop: 2 }}>{s.sub}</div>
                  </div>
                </div>
                {i < arr.length - 1 && <ArrowRight size={16} color="#4A7FBB" />}
              </div>
            )
          })}
        </div>
      </div>

      {/* Step 1 */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 4 }}>Step 1 — Vapi webhook trigger</div>
        <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 12, lineHeight: 1.6 }}>
          Configure a Make.com Webhook module as the scenario trigger. In Vapi&apos;s assistant
          settings, point the &quot;end of call&quot; webhook at the Make webhook URL Make gives you.
          Listen for the <code style={{ color: '#E8622A' }}>call.ended</code> event.
        </p>
        <div style={{ fontSize: 11, color: '#4A7FBB' }}>You should receive a payload with: call.id, transcript, customer.number, startedAt, endedAt, business reference.</div>
      </div>

      {/* Step 2 */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 4 }}>Step 2 — Grok extraction (HTTP request)</div>
        <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 12, lineHeight: 1.6 }}>
          Add an HTTP request module pointing at <code style={{ color: '#E8622A' }}>https://api.x.ai/v1/chat/completions</code>.
          Use the prompt from <code style={{ color: '#E8622A' }}>src/lib/extraction-prompt.ts → CONTACT_EXTRACTION_PROMPT</code>.
          Model <code>grok-2-latest</code>, <code>response_format: json_object</code>, temperature <code>0.1</code>.
        </p>
        <div style={{ fontSize: 11, color: '#4A7FBB' }}>Output: caller_name, caller_email, call_purpose, call_outcome, tags, industry_data.</div>
      </div>

      {/* Step 3 */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 4 }}>Step 3 — POST to /api/contacts/upsert</div>
        <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 12, lineHeight: 1.6 }}>
          Final HTTP module. Endpoint, auth, and payload are below.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '8px 16px', alignItems: 'start', fontSize: 12, marginBottom: 14 }}>
          <span style={{ color: '#4A7FBB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Method</span>
          <span style={{ color: 'white', fontFamily: 'monospace' }}>POST</span>
          <span style={{ color: '#4A7FBB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>URL</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <code style={{ color: 'white', fontSize: 12 }}>{upsertUrl}</code>
            <button onClick={() => copy(upsertUrl, 'url')} aria-label="Copy URL" style={{ background: 'transparent', border: 'none', color: '#7BAED4', cursor: 'pointer' }}>
              {copied === 'url' ? <Check size={14} color="#22C55E" /> : <Copy size={14} />}
            </button>
          </span>
          <span style={{ color: '#4A7FBB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Auth</span>
          <span style={{ color: 'white', fontFamily: 'monospace' }}>Authorization: Bearer ${'{'}CRON_SECRET{'}'}</span>
          <span style={{ color: '#4A7FBB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Content-Type</span>
          <span style={{ color: 'white', fontFamily: 'monospace' }}>application/json</span>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Body</span>
          <button onClick={() => copy(samplePayload, 'body')} style={{ background: 'transparent', border: 'none', color: '#7BAED4', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
            {copied === 'body' ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <pre style={codeBox}>{samplePayload}</pre>
      </div>

      {/* Test connection */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 4 }}>Test the connection</div>
        <p style={{ fontSize: 13, color: '#7BAED4', marginBottom: 12, lineHeight: 1.6 }}>
          Calls <code>{testUrl}</code> and shows what the test endpoint returns. Useful to confirm
          your auth, base URL, and admin gating before wiring up Make.
        </p>
        <button
          onClick={runTest}
          disabled={busy}
          style={{
            background: '#E8622A', color: 'white', border: 'none',
            padding: '10px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700,
            cursor: busy ? 'wait' : 'pointer', fontFamily: 'Outfit, sans-serif',
            opacity: busy ? 0.7 : 1,
          }}
        >{busy ? 'Testing…' : 'Test connection'}</button>

        {testResult && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: testResult.ok ? '#22C55E' : '#EF4444', marginBottom: 6, fontWeight: 700 }}>
              {testResult.ok ? '✓ Connection OK' : `✗ ${testResult.error ?? 'Failed'}`}
            </div>
            <pre style={codeBox}>{JSON.stringify(testResult.data, null, 2)}</pre>
          </div>
        )}
      </div>
    </>
  )
}
