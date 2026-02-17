import { defineConfig, type PreviewServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const staticRouteMap: Record<string, string> = {
  '/': '/landing.html',
  '/landing': '/landing.html',
  '/app': '/index.html',
  '/pricing': '/pricing.html',
  '/terms': '/legal/terms.html',
  '/privacy': '/legal/privacy.html',
  '/refund': '/legal/refund.html',
}

function installLegalRouteRewrite(server: ViteDevServer | PreviewServer): void {
  server.middlewares.use((req, _res, next) => {
    if (!req.url) {
      next()
      return
    }

    const [rawPath, rawQuery] = req.url.split('?')
    const normalizedPath =
      rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath
    const rewriteTarget = staticRouteMap[normalizedPath]

    if (!rewriteTarget) {
      next()
      return
    }

    req.url = rawQuery ? `${rewriteTarget}?${rawQuery}` : rewriteTarget
    next()
  })
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'legal-route-rewrite',
      configureServer(server) {
        installLegalRouteRewrite(server)
      },
      configurePreviewServer(server) {
        installLegalRouteRewrite(server)
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  server: {
    port: 4173,
    strictPort: true,
    hmr: {
      overlay: false,
    },
  },
  build: {
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        landing: resolve(__dirname, 'landing.html'),
        overlay: resolve(__dirname, 'overlay.html'),
      },
    },
  },
})
