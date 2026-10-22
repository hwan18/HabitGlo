import { useEffect } from 'react'
import { Marquee } from './Marquee'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { identifyPostHogUser, resetPostHogUser } from '@/lib/posthog'
import { OVERLAY_SYNC_EVENT, type OverlaySyncPayload } from '@/lib/overlaySync'
import { listen } from '@tauri-apps/api/event'

export default function OverlayApp() {
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

  // Fallback for the Tauri event: follow the main window's saved state.
  useEffect(() => {
    const syncFromStorage = () => {
      const stored = localStorage.getItem('habitglo-store')
      if (!stored) return
      try {
        const parsed = JSON.parse(stored)
        const currentState = useHabitsStore.getState()
        if (parsed.state?.overlay && JSON.stringify(parsed.state.overlay) !== JSON.stringify(currentState.overlay)) {
          useHabitsStore.setState({ overlay: parsed.state.overlay })
        }
        if (Array.isArray(parsed.state?.habits) && JSON.stringify(currentState.habits) !== JSON.stringify(parsed.state.habits)) {
          useHabitsStore.setState({ habits: parsed.state.habits })
        }
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('storage', syncFromStorage)
    const interval = setInterval(syncFromStorage, 200)
    syncFromStorage()
    return () => {
      window.removeEventListener('storage', syncFromStorage)
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="h-screen w-screen bg-black/30 p-2">
      <div className="overlay-shell h-full rounded-xl">
        <Marquee emptyMessage="Add a reminder in HabitGlo" />
      </div>
    </div>
  )
}
