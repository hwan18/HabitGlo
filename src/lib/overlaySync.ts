import type { Habit, OverlaySettings } from '@/types'
import { isTauri } from './platform'

export const OVERLAY_SYNC_EVENT = 'habitglo:overlay-sync'
/** Sent by the overlay once it listens, so the main window answers with the current state. */
export const OVERLAY_READY_EVENT = 'habitglo:overlay-ready'
export const OVERLAY_SYNC_DEBOUNCE_MS = 80

export type OverlayHabit = Pick<Habit, 'id' | 'text' | 'is_active' | 'priority' | 'colorIndex'>

export type OverlaySyncPayload = {
  overlay: OverlaySettings
  habits: OverlayHabit[]
  userId: string | null
}

type SyncSource = {
  overlay: OverlaySettings
  habits: Habit[]
  user: { id: string } | null
}

/** Only what the strip draws, so server-only fields (streaks, timestamps) never trigger a resend. */
export const buildOverlayPayload = (state: SyncSource): OverlaySyncPayload => ({
  overlay: state.overlay,
  habits: state.habits.map(({ id, text, is_active, priority, colorIndex }) => ({ id, text, is_active, priority, colorIndex })),
  userId: state.user?.id ?? null,
})

export type SyncTransport = {
  emit: (event: string, payload: OverlaySyncPayload) => void
  listen: (event: string, handler: () => void) => () => void
}

type Store = {
  getState: () => SyncSource
  subscribe: (listener: () => void) => () => void
}

/**
 * Main window side: sends the strip's state after changes settle (one message per burst),
 * skips sends when nothing visible changed, and always answers an overlay that just started.
 */
export const startOverlaySync = (store: Store, transport: SyncTransport, debounceMs = OVERLAY_SYNC_DEBOUNCE_MS) => {
  let lastSent = ''
  let timer: ReturnType<typeof setTimeout> | null = null

  const send = (force: boolean) => {
    timer = null
    const payload = buildOverlayPayload(store.getState())
    const serialized = JSON.stringify(payload)
    if (!force && serialized === lastSent) return
    lastSent = serialized
    transport.emit(OVERLAY_SYNC_EVENT, payload)
  }

  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => send(false), debounceMs)
  }

  let prev = store.getState()
  const unsubscribe = store.subscribe(() => {
    const next = store.getState()
    if (next.habits === prev.habits && next.overlay === prev.overlay && next.user?.id === prev.user?.id) return
    prev = next
    schedule()
  })
  const unlistenReady = transport.listen(OVERLAY_READY_EVENT, () => send(true))
  send(true)

  return () => {
    if (timer) clearTimeout(timer)
    unsubscribe()
    unlistenReady()
  }
}

/** Tauri event transport (a no-op outside the desktop app). */
export const tauriTransport: SyncTransport = {
  emit: (event, payload) => {
    if (!isTauri) return
    void import('@tauri-apps/api/event').then(({ emit }) => emit(event, payload)).catch(() => {})
  },
  listen: (event, handler) => {
    if (!isTauri) return () => {}
    let disposed = false
    let unlisten: (() => void) | null = null
    void import('@tauri-apps/api/event')
      .then(({ listen }) => listen(event, handler))
      .then((dispose) => {
        if (disposed) dispose()
        else unlisten = dispose
      })
      .catch(() => {})
    return () => {
      disposed = true
      unlisten?.()
    }
  },
}
