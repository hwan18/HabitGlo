import { useEffect } from 'react'
import { Marquee } from './Marquee'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { invoke } from '@tauri-apps/api/tauri'
import { WebviewWindow } from '@tauri-apps/api/window'

export default function OverlayApp() {
  const overlay = useHabitsStore((s) => s.overlay)
  const setOverlay = useHabitsStore((s) => s.setOverlay)

  useEffect(() => {
    invoke('set_click_through', { enabled: overlay.clickThrough }).catch(() => {})
    invoke('set_always_on_top', { enabled: overlay.alwaysOnTop }).catch(() => {})
  }, [overlay.clickThrough, overlay.alwaysOnTop])

  useEffect(() => {
    const overlayWindow = WebviewWindow.getByLabel('overlay')
    overlayWindow?.setIgnoreCursorEvents(overlay.clickThrough)
    overlayWindow?.setAlwaysOnTop(overlay.alwaysOnTop)
  }, [overlay.clickThrough, overlay.alwaysOnTop])

  useEffect(() => {
    const syncFromStorage = () => {
      const stored = localStorage.getItem('habitglo-store')
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          if (parsed.state?.overlay) setOverlay(parsed.state.overlay)
        } catch {
          /* ignore */
        }
      }
    }
    window.addEventListener('storage', syncFromStorage)
    syncFromStorage()
    return () => window.removeEventListener('storage', syncFromStorage)
  }, [setOverlay])

  return (
    <div className="h-screen w-screen bg-black/30 p-2">
      <div className="h-full rounded-xl border border-white/10 shadow-2xl shadow-black/60">
        <Marquee />
      </div>
    </div>
  )
}
