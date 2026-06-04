'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Waveform
// Audio scrubber bar strip.
// Matches .waverow / .waverow i.on from calls.html
//
// IMPORTANT: bar heights are deterministic (formula-based, no Math.random)
// so SSR and CSR produce identical output → no hydration mismatch.
// ─────────────────────────────────────────────────────────────────────────────

interface WaveformProps {
  /** Number of bars to render (default 80) */
  bars?: number
  /** Playback progress as a fraction 0..1 */
  progress: number
  /** Called with the new fractional position when user clicks a bar */
  onScrub?: (progress: number) => void
  /**
   * Optional fixed bar heights in px.
   * If absent a deterministic pseudo-random pattern is computed from index.
   */
  heights?: number[]
}

/** Deterministic height formula — matches SSR and CSR identically */
function barHeight(i: number): number {
  return 6 + ((i * 37) % 18)
}

export function Waveform({
  bars = 80,
  progress,
  onScrub,
  heights,
}: WaveformProps) {
  return (
    <div
      className="flex h-10 w-full items-end gap-[2px]"
      aria-label="Audio waveform scrubber"
    >
      {Array.from({ length: bars }, (_, i) => {
        const played = i / bars <= progress
        const h = heights ? (heights[i] ?? barHeight(i)) : barHeight(i)

        return (
          <div
            key={i}
            role={onScrub ? 'button' : undefined}
            aria-label={onScrub ? `Seek to ${Math.round((i / bars) * 100)}%` : undefined}
            tabIndex={onScrub ? 0 : undefined}
            className="w-[3px] flex-1 rounded-full transition-colors duration-100"
            style={{
              height: h,
              background: played ? 'var(--orange)' : 'var(--line-strong)',
              cursor: onScrub ? 'pointer' : 'default',
            }}
            onClick={
              onScrub
                ? () => onScrub(Math.min(1, (i + 1) / bars))
                : undefined
            }
            onKeyDown={
              onScrub
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onScrub(Math.min(1, (i + 1) / bars))
                    }
                  }
                : undefined
            }
          />
        )
      })}
    </div>
  )
}
