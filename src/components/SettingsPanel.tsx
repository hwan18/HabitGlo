import { useHabitsStore, palettesList } from '@/stores/useHabitsStore'
import { Button } from './Button'
import {
  ArrowUpDown,
  Lock,
  MonitorSmartphone,
  MousePointerClick,
  PinIcon,
  MoveUpRight,
  MoveDownRight,
} from 'lucide-react'
import { isTauri } from '@/lib/platform'

/** Dynamically import Tauri APIs only when running in Tauri */
const tauriInvoke = async (...args: Parameters<typeof import('@tauri-apps/api/tauri').invoke>) => {
  if (!isTauri) return
  const { invoke } = await import('@tauri-apps/api/tauri')
  return invoke(...args)
}

const getTauriOverlayWindow = async () => {
  if (!isTauri) return null
  const { WebviewWindow } = await import('@tauri-apps/api/window')
  return WebviewWindow.getByLabel('overlay')
}

/** Palette IDs available in browser preview */
const BROWSER_FREE_PALETTES = new Set(['classic'])

export function SettingsPanel() {
  const theme = useHabitsStore((s) => s.theme)
  const overlay = useHabitsStore((s) => s.overlay)
  const setOverlay = useHabitsStore((s) => s.setOverlay)
  const setTheme = useHabitsStore((s) => s.setTheme)

  const toggleOverlayVisibility = async () => {
    const win = await getTauriOverlayWindow()
    if (win) {
      const visible = await win.isVisible()
      visible ? await win.hide() : await win.show()
    }
  }

  const applyClickThrough = async (value: boolean) => {
    if (!isTauri) return
    setOverlay({ clickThrough: value })
    const overlayWindow = await getTauriOverlayWindow()
    if (overlayWindow) {
      await overlayWindow.setIgnoreCursorEvents(value).catch(() => {})
    }
  }

  const applyAlwaysOnTop = async (value: boolean) => {
    if (!isTauri) return
    setOverlay({ alwaysOnTop: value })
    const overlayWindow = await getTauriOverlayWindow()
    if (overlayWindow) {
      await overlayWindow.setAlwaysOnTop(value).catch(() => {})
    }
  }

  const applyReserveSpace = async (value: boolean) => {
    if (!isTauri) return
    setOverlay({ reserveSpace: value })
    await tauriInvoke('set_reserve_space', { enabled: value })
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-white">App Overlay Settings</p>
        <Button size="sm" variant="ghost" onClick={toggleOverlayVisibility} disabled={!isTauri}>
          <MonitorSmartphone size={14} className="mr-1" /> Toggle overlay
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-3 text-xs text-white/70">
          Scroll speed
          <input
            type="range"
            min={10}
            max={800}
            value={overlay.speed}
            onChange={(e) => setOverlay({ speed: Number(e.target.value) })}
            className="w-full"
          />
          <span className="w-14 text-right">{overlay.speed.toFixed(0)} px/s</span>
        </label>
        <label className="flex items-center gap-3 text-xs text-white/70">
          Spacing / frequency
          <input
            type="range"
            min={0}
            max={800}
            value={overlay.spacing ?? 0}
            onChange={(e) => setOverlay({ spacing: Number(e.target.value) })}
            className="w-full"
          />
          <span className="w-14 text-right">{(overlay.spacing ?? 0).toFixed(0)} px</span>
        </label>

        {/* Desktop-feature toggles */}
        <label className={`flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2 ${!isTauri ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-2">
            <MousePointerClick size={16} />
            <span>Click-through</span>
          </div>
          <input type="checkbox" checked={overlay.clickThrough} onChange={(e) => applyClickThrough(e.target.checked)} disabled={!isTauri} />
        </label>
        <label className={`flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2 ${!isTauri ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-2">
            <PinIcon size={16} />
            <span>Always on top</span>
          </div>
          <input type="checkbox" checked={overlay.alwaysOnTop} onChange={(e) => applyAlwaysOnTop(e.target.checked)} disabled={!isTauri} />
        </label>
        <label className={`flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2 ${!isTauri ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-2">
            <ArrowUpDown size={16} />
            <span>Reserve screen space</span>
          </div>
          <input type="checkbox" checked={overlay.reserveSpace} onChange={(e) => applyReserveSpace(e.target.checked)} disabled={!isTauri} />
        </label>

        {/* Desktop-only note */}
        {!isTauri && (
          <div className="rounded-lg border border-white/10 bg-glow-blue/5 px-3 py-2">
            <p className="text-[11px] text-white/50">
              <span className="font-semibold text-glow-blue/80">Desktop app required</span> — Click-through, always on top, reserve screen space, and snap to top/bottom are available in the desktop app.
            </p>
          </div>
        )}

        <div className={`flex gap-2 ${!isTauri ? 'opacity-50 pointer-events-none' : ''}`}>
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center gap-2 flex-1"
            onClick={() => tauriInvoke('snap_to_top')}
            disabled={!isTauri}
          >
            <MoveUpRight size={14} />
            Snap to top
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center gap-2 flex-1"
            onClick={() => tauriInvoke('snap_to_bottom')}
            disabled={!isTauri}
          >
            <MoveDownRight size={14} />
            Snap to bottom
          </Button>
        </div>
      </div>
      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="text-sm font-semibold text-white">Aesthetic Suite</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {palettesList.map((p) => {
            const locked = !isTauri && !BROWSER_FREE_PALETTES.has(p.id)

            return (
              <button
                key={p.id}
                onClick={() => !locked && setTheme({ palette: p.id as any })}
                disabled={locked}
                className={`relative rounded-lg border p-2 text-left text-xs transition-colors ${
                  locked
                    ? 'cursor-not-allowed border-white/5 bg-black/40'
                    : 'border-white/10 bg-black/40 text-white/70 hover:border-glow-blue'
                }`}
              >
                {locked && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-black/60 backdrop-blur-[2px]">
                    <Lock size={12} className="text-white/40" />
                    <span className="mt-0.5 text-[9px] text-white/40">Desktop app</span>
                  </div>
                )}
                <div className={`mb-1 font-semibold text-[11px] ${locked ? 'text-white/30' : 'text-white'}`}>{p.label}</div>
                <div className="flex gap-1">
                  <span className="h-4 w-4 rounded" style={{ background: p.colors.primary }} />
                  <span className="h-4 w-4 rounded" style={{ background: p.colors.secondary }} />
                  <span className="h-4 w-4 rounded" style={{ background: p.colors.accent }} />
                </div>
              </button>
            )
          })}
        </div>
        <label className="mt-3 flex items-center gap-3 text-xs text-white/70">
          Glow / bloom
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={theme.glow}
            onChange={(e) => setTheme({ glow: Number(e.target.value) })}
            className="w-full"
          />
          <span className="w-10 text-right">{Math.round(theme.glow * 100)}%</span>
        </label>
        <label className="mt-2 flex items-center gap-3 text-xs text-white/70">
          Text glow opacity
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={theme.opacity}
            onChange={(e) => setTheme({ opacity: Number(e.target.value) })}
            className="w-full"
          />
          <span className="w-10 text-right">{Math.round(theme.opacity * 100)}%</span>
        </label>
      </div>
    </div>
  )
}
