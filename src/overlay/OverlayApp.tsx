import { useEffect } from 'react'
import { Marquee } from './Marquee'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { identifyPostHogUser, resetPostHogUser } from '@/lib/posthog'
import { OVERLAY_SYNC_EVENT, type OverlaySyncPayload } from '@/lib/overlaySync'
import { listen } from '@tauri-apps/api/event'
import { WebviewWindow } from '@tauri-apps/api/window'

export default function OverlayApp() {
  const overlay = useHabitsStore((s) => s.overlay)
  const setOverlay = useHabitsStore((s) => s.setOverlay)

  useEffect(() => {
    const overlayWindow = WebviewWindow.getByLabel('overlay')
    overlayWindow?.setIgnoreCursorEvents(overlay.clickThrough)
    overlayWindow?.setAlwaysOnTop(overlay.alwaysOnTop)
  }, [overlay.clickThrough, overlay.alwaysOnTop])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let identifiedUserId: string | null = null

    void listen<OverlaySyncPayload>(OVERLAY_SYNC_EVENT, ({ payload }) => {
      if (payload.userId !== identifiedUserId) {
        if (identifiedUserId) resetPostHogUser()
        if (payload.userId) identifyPostHogUser({ id: payload.userId })
        identifiedUserId = payload.userId
      }

      useHabitsStore.setState({
        theme: payload.theme,
        overlay: payload.overlay,
        habits: payload.habits,
      })
    }).then((dispose) => {
      unlisten = dispose
    })

    return () => {
      unlisten?.()
    }
  }, [])

  // Note: Overlay window doesn't have direct Supabase auth access
  // (Tauri webviews don't share localStorage/auth tokens)
  // Keep the localStorage sync as a fallback; Tauri event sync is the primary path.

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

          // Sync user state (without triggering hydrate - overlay reads habits from localStorage)
          if (parsed.state?.user && parsed.state.user.id !== currentState.user?.id) {
            useHabitsStore.setState({ user: parsed.state.user })
          }
          
          // Sync habits from dashboard (always persisted to localStorage for overlay)
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

  const handleMouseDown = async (e: React.MouseEvent) => {
    if (overlay.clickThrough) return
    if (e.button !== 0) return
    if (!e.ctrlKey && !e.altKey) return
    // Only start dragging if clicking on the background, not on interactive elements
    if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.cursor-move')) {
      const overlayWindow = WebviewWindow.getByLabel('overlay')
      await overlayWindow?.startDragging()
    }
  }

  return (
    <div
      className="h-screen w-screen bg-black/30 p-2 cursor-move"
      title="Hold Ctrl or Alt, then drag to move"
      onMouseDown={handleMouseDown}
    >
      <div className="overlay-shell h-full rounded-xl">
        <Marquee emptyMessage="Add a reminder in HabitGlo" />
      </div>
    </div>
  )
}
