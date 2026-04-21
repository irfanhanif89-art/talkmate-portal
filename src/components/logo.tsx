import Image from 'next/image'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'full' | 'icon'
}

// Full SVG logo — matches exact brand spec
export function Logo({ size = 'md', variant = 'full' }: LogoProps) {
  const heights = { sm: 32, md: 40, lg: 52 }
  const h = heights[size]
  const w = variant === 'icon' ? h : Math.round(h * (400 / 120))

  return (
    <Image
      src="/logo.svg"
      alt="Talkmate"
      width={w}
      height={h}
      priority
      style={{ height: h, width: variant === 'icon' ? h : 'auto' }}
    />
  )
}

// Inline wordmark for dark backgrounds (inverts text colour)
export function LogoDark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const heights = { sm: 28, md: 36, lg: 48 }
  const h = heights[size]

  return (
    <svg width={Math.round(h * 3.2)} height={h} viewBox="0 0 400 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* T Tile */}
      <rect width="120" height="120" rx="22" fill="#E8622A"/>
      <rect x="18" y="20" width="84" height="18" fill="white"/>
      <rect x="51" y="20" width="18" height="62" fill="white"/>
      <path d="M 108 78 A 30 30 0 0 0 78 108" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.3"/>
      <path d="M 108 88 A 20 20 0 0 0 88 108" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>
      <path d="M 108 98 A 10 10 0 0 0 98 108" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
      <circle cx="108" cy="108" r="4.5" fill="white"/>
      {/* Divider */}
      <rect x="140" y="16" width="1.5" height="88" fill="#E8622A" opacity="0.45"/>
      {/* Wordmark — white on dark */}
      <text x="158" y="78" fontFamily="'Outfit', sans-serif" fontSize="52" fontWeight="800" fill="white" letterSpacing="-2">Talk</text>
      <text x="160" y="108" fontFamily="'Outfit', sans-serif" fontSize="26" fontWeight="300" fill="#4A9FE8" letterSpacing="4">Mate</text>
    </svg>
  )
}
