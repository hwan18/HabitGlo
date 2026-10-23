import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './overlay.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        app: {
          bg: '#0d0b09',
          card: '#16130f',
          raised: '#221e18',
          border: '#3a332b',
          text: '#f2ebdd',
          muted: '#a1978a',
          accent: '#ffb000',
          'accent-text': '#1c1303',
          danger: '#ff6b63',
        },
      },
    },
  },
  plugins: [],
}

export default config
