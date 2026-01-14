import { useEffect } from 'react'
import { Marquee } from './Marquee'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { WebviewWindow } from '@tauri-apps/api/window'

export default function OverlayApp() {
  const overlay = useHabitsStore((s) => s.overlay)
  const setOverlay = useHabitsStore((s) => s.setOverlay)
  const habits = useHabitsStore((s) => s.habits)

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
          const currentState = useHabitsStore.getState()
          
          // Sync overlay settings
          if (parsed.state?.overlay && JSON.stringify(parsed.state.overlay) !== JSON.stringify(currentState.overlay)) {
            setOverlay(parsed.state.overlay)
          }
          
          // Sync theme settings
          if (parsed.state?.theme && JSON.stringify(parsed.state.theme) !== JSON.stringify(currentState.theme)) {
            useHabitsStore.setState({ theme: parsed.state.theme })
          }
          
          // Sync habits if not using Supabase (habits are persisted locally)
          if (parsed.state?.habits && Array.isArray(parsed.state.habits)) {
            const currentHabits = currentState.habits
            // Only update if habits actually changed
            if (JSON.stringify(currentHabits) !== JSON.stringify(parsed.state.habits)) {
              useHabitsStore.setState({ habits: parsed.state.habits })
            }
          }
        } catch {
          /* ignore */
        }
      }
    }
    // Listen for storage events from other windows
    window.addEventListener('storage', syncFromStorage)
    // Poll for changes every 200ms for faster updates
    const interval = setInterval(syncFromStorage, 200)
    syncFromStorage()
    return () => {
      window.removeEventListener('storage', syncFromStorage)
      clearInterval(interval)
    }
  }, [setOverlay])
  
  // Also re-hydrate habits when component mounts
  useEffect(() => {
    useHabitsStore.getState().hydrate()
  }, [])

  const handleMouseDown = async (e: React.MouseEvent) => {
    if (overlay.clickThrough) return
    // Only start dragging if clicking on the background, not on interactive elements
    if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.cursor-move')) {
      const overlayWindow = WebviewWindow.getByLabel('overlay')
      await overlayWindow?.startDragging()
    }
  }

  return (
    <div
      className="h-screen w-screen bg-black/30 p-2 cursor-move"
      onMouseDown={handleMouseDown}
    >
      <div className="h-full rounded-xl border border-white/10 shadow-2xl shadow-black/60">
        <Marquee />
      </div>
    </div>
  )
}
