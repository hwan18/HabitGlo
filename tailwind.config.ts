import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './overlay.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
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
      },
    },
  },
  plugins: [],
}

export default config
