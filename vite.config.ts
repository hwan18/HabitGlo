import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
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

/**
 * `vite build --mode desktop` (Tauri's beforeBuildCommand) writes dist-desktop/ with only what index.html and
 * overlay.html load: no landing entry, and only the public/ files listed in desktop-public-files.json
 * (download/windows.html stays because Paddle's in-app checkout redirects there after payment).
 * WebView2 always loads the woff2 source of each @font-face, so the woff fallbacks are dropped too.
 */
function desktopBundle(): Plugin {
  const files: string[] = JSON.parse(readFileSync(resolve(__dirname, 'desktop-public-files.json'), 'utf8'))
  return {
    name: 'desktop-bundle',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const fileName of files) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(resolve(__dirname, 'public', fileName)) })
      }
      for (const name of Object.keys(bundle)) {
        if (name.endsWith('.woff')) delete bundle[name]
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const desktop = mode === 'desktop'
  return {
  plugins: [
    react(),
    ...(desktop ? [desktopBundle()] : []),
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
  ...(desktop && { publicDir: false as const }),
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
    ...(desktop && { outDir: 'dist-desktop' }),
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ...(!desktop && { landing: resolve(__dirname, 'landing.html') }),
        overlay: resolve(__dirname, 'overlay.html'),
      },
    },
  },
  }
})
