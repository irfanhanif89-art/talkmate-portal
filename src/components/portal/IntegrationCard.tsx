'use client'

// Shared card for the Settings > Integrations tab. Presentational only — each
// integration supplies its own state + handlers. Styling uses design-system
// tokens so it adapts to dark/light.

import { Panel } from '@/components/portal/ui-v2/panel'
import { ButtonV2 } from '@/components/portal/ui-v2/button'

export interface IntegrationCardProps {
  logo: React.ReactNode
  name: string
  description: string
  connected: boolean
  connectedLabel?: string
  badge?: 'live' | 'coming-soon'
  onConnect?: () => void
  onDisconnect?: () => void
  connecting?: boolean
  children?: React.ReactNode
}

export default function IntegrationCard({
  logo, name, description, connected, connectedLabel, badge,
  onConnect, onDisconnect, connecting, children,
}: IntegrationCardProps) {
  const comingSoon = badge === 'coming-soon'

  return (
    <Panel className="relative flex flex-col">
      {/* top-right badge */}
      {badge && (
        <span
          className={[
            'absolute right-4 top-4 rounded-full px-2.5 py-0.5 text-[11px] font-bold',
            badge === 'live' ? 'bg-green/10 text-green' : 'bg-white/[.06] text-dim',
          ].join(' ')}
        >
          {badge === 'live' ? 'Live' : 'Coming soon'}
        </span>
      )}

      <div className="flex items-start gap-3.5">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-line bg-card-2">
          {logo}
        </div>
        <div className="min-w-0 flex-1 pr-16">
          <p className="text-[15px] font-bold text-text">{name}</p>
          <p className="mt-0.5 text-[12.5px] text-dim">{description}</p>
          {connected && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-green">
              <span className="inline-block h-2 w-2 rounded-full bg-green" />
              {connectedLabel ?? 'Connected'}
            </p>
          )}
        </div>
      </div>

      {/* optional inline config (e.g. Zapier URL input) */}
      {children && <div className="mt-4">{children}</div>}

      {/* action button */}
      {!comingSoon && (onConnect || onDisconnect) && (
        <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
          {connected ? (
            <button
              type="button"
              disabled={connecting}
              onClick={onDisconnect}
              className="rounded-[10px] border border-red/40 px-4 py-2 text-[13px] font-semibold text-red transition hover:bg-red/10 disabled:opacity-50"
            >
              {connecting ? 'Working…' : 'Disconnect'}
            </button>
          ) : (
            <ButtonV2 disabled={connecting} onClick={onConnect} className="px-5 py-2 text-[13.5px]">
              {connecting ? 'Connecting…' : 'Connect'}
            </ButtonV2>
          )}
        </div>
      )}
    </Panel>
  )
}

/** Simple coloured letter tile used as a logo placeholder. */
export function LetterLogo({ letter, color }: { letter: string; color: string }) {
  return (
    <span className="text-[18px] font-[800]" style={{ color }}>{letter}</span>
  )
}
