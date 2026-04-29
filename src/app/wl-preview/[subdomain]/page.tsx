import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import type { WhiteLabelConfig } from '@/lib/white-label'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ subdomain: string }> }): Promise<Metadata> {
  const { subdomain } = await params
  return { title: `${subdomain} — White label preview` }
}

export default async function WhiteLabelPreviewPage({ params }: { params: Promise<{ subdomain: string }> }) {
  const { subdomain } = await params
  const admin = createAdminClient()

  const { data: config } = await admin
    .from('white_label_configs')
    .select('*')
    .eq('portal_subdomain', subdomain)
    .maybeSingle()

  if (!config) notFound()

  const c = config as WhiteLabelConfig
  const primary = c.primary_color
  const secondary = c.secondary_color
  const accent = c.accent_color

  const initial = c.brand_name.trim()[0]?.toUpperCase() ?? 'W'

  return (
    <div style={{ minHeight: '100vh', background: secondary, fontFamily: 'Outfit, sans-serif' }}>
      {/* Preview banner */}
      <div style={{
        background: 'rgba(0,0,0,0.45)', borderBottom: `1px solid ${primary}`,
        padding: '8px 18px', textAlign: 'center',
        fontSize: 12, fontWeight: 700, color: 'white', letterSpacing: '0.06em', textTransform: 'uppercase' as const,
      }}>
        This is a white-label preview · {c.brand_name}
      </div>

      <div style={{ display: 'grid', placeItems: 'center', minHeight: 'calc(100vh - 36px)', padding: '40px 20px' }}>
        <div style={{
          width: '100%', maxWidth: 460,
          background: '#0A1E38', border: `1px solid ${primary}33`,
          borderRadius: 18, padding: 36,
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        }}>
          {/* Brand mark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            {c.brand_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.brand_logo_url} alt={c.brand_name} style={{ height: 36, width: 'auto', maxWidth: 200 }} />
            ) : (
              <>
                <div style={{
                  width: 40, height: 40, background: primary, borderRadius: 9,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 800, color: 'white',
                }}>{initial}</div>
                <span style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>
                  {c.brand_name}
                </span>
              </>
            )}
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'white', letterSpacing: '-0.5px', marginBottom: 6 }}>
            Welcome back
          </h1>
          <p style={{ fontSize: 14, color: '#7BAED4', marginBottom: 26 }}>
            Sign in to your {c.brand_name} portal.
          </p>

          <label style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6, display: 'block' }}>
            Email
          </label>
          <input
            type="email" placeholder="you@example.com" disabled
            style={{
              width: '100%', padding: '12px 14px', marginBottom: 14,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 9, color: 'white', fontSize: 14, fontFamily: 'Outfit, sans-serif',
            }}
          />

          <label style={{ fontSize: 11, fontWeight: 700, color: '#7BAED4', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6, display: 'block' }}>
            Password
          </label>
          <input
            type="password" placeholder="••••••••" disabled
            style={{
              width: '100%', padding: '12px 14px', marginBottom: 22,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 9, color: 'white', fontSize: 14, fontFamily: 'Outfit, sans-serif',
            }}
          />

          <button
            disabled
            style={{
              width: '100%', padding: '13px',
              background: primary, color: 'white', border: 'none',
              borderRadius: 10, fontSize: 15, fontWeight: 700,
              cursor: 'not-allowed', fontFamily: 'Outfit, sans-serif',
              letterSpacing: '0.02em',
            }}
          >
            Sign in to {c.brand_name}
          </button>

          <div style={{
            marginTop: 18, padding: '10px 14px',
            background: `${accent}12`, border: `1px solid ${accent}33`,
            borderRadius: 10, fontSize: 12, color: '#7BAED4', textAlign: 'center' as const,
          }}>
            Need help? <span style={{ color: accent, fontWeight: 600 }}>{c.support_email ?? 'support'}</span>
            {c.support_phone ? ` · ${c.support_phone}` : ''}
          </div>

          {!c.hide_talkmate_branding && (
            <div style={{ marginTop: 22, fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center' as const, letterSpacing: '0.05em' }}>
              Powered by TalkMate
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
