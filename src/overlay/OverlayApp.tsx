import { useEffect } from 'react'
import { Marquee } from './Marquee'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { identifyPostHogUser, resetPostHogUser } from '@/lib/posthog'
import { OVERLAY_READY_EVENT, OVERLAY_SYNC_EVENT, type OverlaySyncPayload } from '@/lib/overlaySync'
import { useLedRunning } from '@/lib/useLedRunning'

const STORE_KEY = 'habitglo-store'

export default function OverlayApp() {
  const running = useLedRunning('overlay')

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    let identifiedUserId: string | null = null

    void import('@tauri-apps/api/event').then(async ({ emit, listen }) => {
      const dispose = await listen<OverlaySyncPayload>(OVERLAY_SYNC_EVENT, ({ payload }) => {
        if (payload.userId !== identifiedUserId) {
          if (identifiedUserId) resetPostHogUser()
          if (payload.userId) identifyPostHogUser({ id: payload.userId })
          identifiedUserId = payload.userId
        }
        useHabitsStore.setState({ overlay: payload.overlay, habits: payload.habits })
      })
      if (disposed) {
        dispose()
        return
      }
      unlisten = dispose
      // The main window may have sent its state before this window was listening.
      await emit(OVERLAY_READY_EVENT)
    })

    // Fallback without polling: the main window's saved state changed.
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORE_KEY) void useHabitsStore.persist.rehydrate()
    }
    window.addEventListener('storage', onStorage)

    return () => {
      disposed = true
      unlisten?.()
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return (
    <div className="h-screen w-screen bg-black/30 p-2">
      <div className="overlay-shell h-full overflow-hidden rounded-xl">
        <Marquee emptyMessage="Add a reminder in HabitGlo" running={running} />
      </div>
    </div>
  )
}
