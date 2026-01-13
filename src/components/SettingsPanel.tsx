import { useHabitsStore, palettesList } from '@/stores/useHabitsStore'
import { Button } from './Button'
import { MonitorSmartphone, MousePointerClick, PinIcon, MoveUpRight } from 'lucide-react'
import { invoke } from '@tauri-apps/api/tauri'
import { WebviewWindow } from '@tauri-apps/api/window'

export function SettingsPanel() {
  const theme = useHabitsStore((s) => s.theme)
  const overlay = useHabitsStore((s) => s.overlay)
  const setOverlay = useHabitsStore((s) => s.setOverlay)
  const setTheme = useHabitsStore((s) => s.setTheme)

  const toggleOverlayVisibility = async () => {
    const win = WebviewWindow.getByLabel('overlay')
    if (win) {
      const visible = await win.isVisible()
      visible ? await win.hide() : await win.show()
    }
  }

  const applyClickThrough = (value: boolean) => {
    setOverlay({ clickThrough: value })
    invoke('set_click_through', { enabled: value }).catch(() => {})
  }

  const applyAlwaysOnTop = (value: boolean) => {
    setOverlay({ alwaysOnTop: value })
    invoke('set_always_on_top', { enabled: value }).catch(() => {})
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Overlay Settings</p>
        <Button size="sm" variant="ghost" onClick={toggleOverlayVisibility}>
          <MonitorSmartphone size={14} className="mr-1" /> Toggle overlay
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-3 text-xs text-white/70">
          Scroll speed
          <input
            type="range"
            min={10}
            max={120}
            value={overlay.speed}
            onChange={(e) => setOverlay({ speed: Number(e.target.value) })}
            className="w-full"
          />
          <span className="w-14 text-right">{overlay.speed.toFixed(0)} px/s</span>
        </label>
        <label className="flex items-center gap-3 text-xs text-white/70">
          Gap / padding
          <input
            type="range"
            min={60}
            max={320}
            value={overlay.gap}
            onChange={(e) => setOverlay({ gap: Number(e.target.value) })}
            className="w-full"
          />
          <span className="w-14 text-right">{overlay.gap.toFixed(0)} px</span>
        </label>
        <label className="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2">
          <div className="flex items-center gap-2">
            <MousePointerClick size={16} />
            <span>Click-through</span>
          </div>
          <input type="checkbox" checked={overlay.clickThrough} onChange={(e) => applyClickThrough(e.target.checked)} />
        </label>
        <label className="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2">
          <div className="flex items-center gap-2">
            <PinIcon size={16} />
            <span>Always on top</span>
          </div>
          <input type="checkbox" checked={overlay.alwaysOnTop} onChange={(e) => applyAlwaysOnTop(e.target.checked)} />
        </label>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2"
          onClick={() => invoke('snap_to_top').catch(() => {})}
        >
          <MoveUpRight size={14} />
          Snap to top edge
        </Button>
      </div>
      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="text-sm font-semibold text-white">Aesthetic Suite</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {palettesList.map((p) => (
            <button
              key={p.id}
              onClick={() => setTheme({ palette: p.id as any })}
              className="rounded-lg border border-white/10 bg-black/40 p-2 text-left text-xs text-white/70 hover:border-glow-blue"
            >
              <div className="mb-1 text-white font-semibold">{p.label}</div>
              <div className="flex gap-1">
                <span className="h-4 w-4 rounded" style={{ background: p.colors.primary }} />
                <span className="h-4 w-4 rounded" style={{ background: p.colors.secondary }} />
                <span className="h-4 w-4 rounded" style={{ background: p.colors.accent }} />
              </div>
            </button>
          ))}
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
          Panel opacity
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
