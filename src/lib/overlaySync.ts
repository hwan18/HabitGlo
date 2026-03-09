import type { Habit, OverlaySettings, ThemeSettings } from '@/types'
import { isTauri } from './platform'

export const OVERLAY_SYNC_EVENT = 'habitglo:overlay-sync'

export type OverlaySyncPayload = {
  theme: ThemeSettings
  overlay: OverlaySettings
  habits: Habit[]
}

export const emitOverlaySync = async (payload: OverlaySyncPayload) => {
  if (!isTauri) return

  const { emit } = await import('@tauri-apps/api/event')
  await emit(OVERLAY_SYNC_EVENT, payload).catch(() => {})
}
