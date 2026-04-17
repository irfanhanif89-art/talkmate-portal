import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
      },
      colors: {
        'brand-orange': '#E8622A',
        'brand-orange-hover': '#C04A0F',
        'brand-blue': '#1565C0',
        'brand-blue-light': '#4A9FE8',
        'brand-dark': '#061322',
        'brand-navy': '#0A1E38',
        'brand-muted': '#4A7FBB',
        'brand-light': '#F2F6FB',
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.375rem',
      },
    },
  },
  plugins: [],
}

export default config
