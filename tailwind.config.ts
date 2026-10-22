import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './overlay.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        fatdot: ['"DM Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        app: {
          bg: '#0d0f14',
          card: '#151922',
          raised: '#1d2230',
          border: '#2b3142',
          text: '#f4f4f5',
          muted: '#a6a8b4',
          accent: '#ffb000',
          'accent-text': '#1a1200',
          danger: '#ff7b72',
        },
        glow: {
          red: 'hsl(var(--destructive) / <alpha-value>)',
          amber: 'hsl(var(--chart-3) / <alpha-value>)',
          green: 'hsl(var(--chart-1) / <alpha-value>)',
          pink: 'hsl(var(--primary) / <alpha-value>)',
          blue: 'hsl(var(--chart-4) / <alpha-value>)',
          yellow: 'hsl(var(--chart-5) / <alpha-value>)',
        },
      },
      boxShadow: {
        glow: '0 0 18px hsl(var(--primary) / 0.35), 0 0 38px hsl(var(--chart-4) / 0.25)',
      },
      backgroundImage: {
        burn: 'radial-gradient(circle at 10% 20%, hsl(var(--foreground) / 0.05) 0, transparent 25%), radial-gradient(circle at 80% 40%, hsl(var(--primary) / 0.04) 0, transparent 20%), radial-gradient(circle at 50% 80%, hsl(var(--chart-4) / 0.05) 0, transparent 20%)',
      },
    },
  },
  plugins: [],
}

export default config
