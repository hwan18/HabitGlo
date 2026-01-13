import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './overlay.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        fatdot: ['"DM Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        glow: {
          red: '#ff3131',
          amber: '#ffb000',
          green: '#6bff6b',
          pink: '#ff5ad9',
          blue: '#36d2ff',
          yellow: '#f5ff6b',
        },
      },
      boxShadow: {
        glow: '0 0 18px rgba(255, 80, 80, 0.35), 0 0 38px rgba(255, 80, 80, 0.25)',
      },
      backgroundImage: {
        burn: 'radial-gradient(circle at 10% 20%, rgba(255,255,255,0.05) 0, transparent 25%), radial-gradient(circle at 80% 40%, rgba(255,255,255,0.04) 0, transparent 20%), radial-gradient(circle at 50% 80%, rgba(255,255,255,0.05) 0, transparent 20%)',
      },
    },
  },
  plugins: [],
}

export default config
