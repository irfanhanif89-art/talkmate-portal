'use client'

import { useState } from 'react'
import { Film, Loader2, Check } from 'lucide-react'
import { DEMO_INDUSTRIES } from '@/lib/demo-config'

interface Props {
  demoIndustry: string | null
  demoDisplay: string
  demoPortalToken: string
  demoVideoUrl: string
}

function resolveIndustryLabel(key: string | null): string {
  if (!key) return ''
  const found = DEMO_INDUSTRIES.find((i) => i.key === key)
  return found ? found.label : key
}

function extractYouTubeId(url: string): string | null {
  const watchMatch = url.match(/youtube\.com\/watch\?.*v=([^&]+)/)
  if (watchMatch) return watchMatch[1]
  const shortMatch = url.match(/youtu\.be\/([^?]+)/)
  if (shortMatch) return shortMatch[1]
  return null
}

function extractVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/)
  return match ? match[1] : null
}

const cardStyle: React.CSSProperties = {
  background: '#0A1E38',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  padding: '24px 28px',
}

export default function DemoLauncherClient({
  demoIndustry,
  demoDisplay,
  demoPortalToken,
  demoVideoUrl,
}: Props) {
  const [loadingAgent, setLoadingAgent] = useState(false)
  const [agentReady, setAgentReady] = useState(false)
  const [agentError, setAgentError] = useState<string | null>(null)
  const [videoCopied, setVideoCopied] = useState(false)

  const industryLabel = resolveIndustryLabel(demoIndustry)

  async function handleLoadAgent() {
    if (!demoIndustry) return
    setLoadingAgent(true)
    setAgentError(null)
    setAgentReady(false)
    try {
      const res = await fetch('/api/sales/launch-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry: demoIndustry }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) {
        setAgentError(body?.error ?? 'Could not load demo agent.')
      } else {
        setAgentReady(true)
        setTimeout(() => setAgentReady(false), 5000)
      }
    } catch {
      setAgentError('Network error. Please try again.')
    } finally {
      setLoadingAgent(false)
    }
  }

  async function handleCopyVideoLink() {
    if (!demoVideoUrl) return
    try {
      await navigator.clipboard.writeText(demoVideoUrl)
      setVideoCopied(true)
      setTimeout(() => setVideoCopied(false), 2000)
    } catch {
      // best-effort
    }
  }

  const portalDisabled = !demoIndustry || !demoPortalToken
  const portalHref =
    demoIndustry && demoPortalToken
      ? `/sales-demo/${demoIndustry}?token=${demoPortalToken}`
      : '#'

  // Resolve video embed
  const youtubeId = demoVideoUrl ? extractYouTubeId(demoVideoUrl) : null
  const vimeoId = !youtubeId && demoVideoUrl ? extractVimeoId(demoVideoUrl) : null
  const isDirectVideo = demoVideoUrl && !youtubeId && !vimeoId

  return (
    <div style={{ padding: '24px 24px 60px', fontFamily: 'Outfit, system-ui, sans-serif', maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, fontWeight: 600, margin: 0, color: 'white', letterSpacing: '-0.5px' }}>
          Demo Hub
        </h1>
        <p style={{ fontSize: 16, color: '#7BAED4', margin: '8px 0 0' }}>
          Everything you need to run a great demo call.
        </p>
      </div>

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Section 1 - Your Demo Agent */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'white', margin: '0 0 16px' }}>
            Your Demo Agent
          </h2>

          {demoIndustry ? (
            <div>
              <p style={{ fontSize: 14, color: '#7BAED4', margin: '0 0 12px' }}>
                Industry: <span style={{ color: 'white', fontWeight: 600 }}>{industryLabel}</span>
              </p>

              {/* Phone number box */}
              <div style={{
                background: '#061322',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                padding: '16px 20px',
                marginBottom: 12,
              }}>
                <div style={{ fontSize: 11, color: '#7BAED4', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Demo Phone Number
                </div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#E8622A', letterSpacing: 1 }}>
                  {demoDisplay || 'Not configured'}
                </div>
                <div style={{ fontSize: 14, color: '#7BAED4', marginTop: 8 }}>
                  Give this number to your prospect. Ask them to call it right now.
                </div>
              </div>

              {/* Load Demo Agent button */}
              <button
                onClick={handleLoadAgent}
                disabled={loadingAgent}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: loadingAgent ? '#7B3A1A' : '#E8622A',
                  color: 'white',
                  fontFamily: 'Outfit, system-ui, sans-serif',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: loadingAgent ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                {loadingAgent && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
                {loadingAgent ? 'Loading...' : 'Load Demo Agent'}
              </button>

              {agentReady && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 99,
                  background: 'rgba(34,197,94,0.15)',
                  border: '1px solid rgba(34,197,94,0.35)',
                  color: '#22c55e',
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 8,
                }}>
                  <Check size={13} /> Agent ready
                </div>
              )}

              {agentError && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: 9,
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  color: '#ef4444',
                  fontSize: 13,
                  marginBottom: 8,
                }}>
                  {agentError}
                </div>
              )}

              <p style={{ fontSize: 12, color: '#7BAED4', margin: 0 }}>
                Always load the agent before your demo call.
              </p>
            </div>
          ) : (
            <div style={{
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: '24px 20px',
              color: '#7BAED4',
              fontSize: 14,
            }}>
              <p style={{ margin: '0 0 6px', color: 'white', fontWeight: 600 }}>
                Your demo industry has not been configured yet.
              </p>
              <p style={{ margin: 0 }}>
                Contact your manager to get this set up.
              </p>
            </div>
          )}
        </div>

        {/* Section 2 - Live Portal Preview */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'white', margin: '0 0 8px' }}>
            Live Portal Preview
          </h2>
          <p style={{ fontSize: 14, color: '#7BAED4', margin: '0 0 20px' }}>
            Show your prospect exactly what their dashboard looks like. Fully interactive.
          </p>

          <a
            href={portalDisabled ? undefined : portalHref}
            target="_blank"
            rel="noopener noreferrer"
            title={portalDisabled ? 'Configure your demo industry first.' : undefined}
            onClick={portalDisabled ? (e) => e.preventDefault() : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '14px 28px',
              borderRadius: 10,
              background: '#061322',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.12)',
              fontFamily: 'Outfit, system-ui, sans-serif',
              fontSize: 15,
              fontWeight: 700,
              textDecoration: 'none',
              cursor: portalDisabled ? 'not-allowed' : 'pointer',
              opacity: portalDisabled ? 0.4 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            Open Demo Portal
          </a>
        </div>

        {/* Section 3 - Overview Video */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'white', margin: '0 0 8px' }}>
            TalkMate Overview Video
          </h2>
          <p style={{ fontSize: 14, color: '#7BAED4', margin: '0 0 20px' }}>
            Share this with prospects after your demo call.
          </p>

          {demoVideoUrl ? (
            <div>
              {/* Video embed */}
              {youtubeId && (
                <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${youtubeId}`}
                    style={{
                      position: 'absolute',
                      top: 0, left: 0,
                      width: '100%',
                      height: '100%',
                      border: 0,
                      borderRadius: 8,
                    }}
                    allowFullScreen
                    title="TalkMate Overview"
                  />
                </div>
              )}

              {vimeoId && (
                <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                  <iframe
                    src={`https://player.vimeo.com/video/${vimeoId}`}
                    style={{
                      position: 'absolute',
                      top: 0, left: 0,
                      width: '100%',
                      height: '100%',
                      border: 0,
                      borderRadius: 8,
                    }}
                    allowFullScreen
                    title="TalkMate Overview"
                  />
                </div>
              )}

              {isDirectVideo && (
                <video
                  controls
                  src={demoVideoUrl}
                  style={{ width: '100%', borderRadius: 8, marginBottom: 16 }}
                />
              )}

              {/* Copy Video Link button */}
              <button
                onClick={handleCopyVideoLink}
                style={{
                  padding: '10px 20px',
                  borderRadius: 9,
                  border: '1px solid ' + (videoCopied ? '#22c55e' : 'rgba(232,98,42,0.3)'),
                  background: videoCopied ? 'rgba(34,197,94,0.15)' : 'rgba(232,98,42,0.12)',
                  color: videoCopied ? '#22c55e' : '#E8622A',
                  fontFamily: 'Outfit, system-ui, sans-serif',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {videoCopied ? <Check size={14} /> : null}
                {videoCopied ? 'Copied!' : 'Copy Video Link'}
              </button>
            </div>
          ) : (
            <div style={{
              border: '1px dashed rgba(255,255,255,0.12)',
              borderRadius: 10,
              padding: '40px 20px',
              textAlign: 'center',
              color: '#7BAED4',
            }}>
              <Film size={28} style={{ opacity: 0.5, marginBottom: 12 }} />
              <p style={{ margin: '0 0 4px', fontWeight: 600, color: 'white' }}>Video coming soon</p>
              <p style={{ margin: 0, fontSize: 13 }}>
                This will show your TalkMate overview video once it is ready.
              </p>
            </div>
          )}
        </div>

      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
