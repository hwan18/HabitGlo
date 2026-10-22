import { isTauri } from './platform'
import type { OverlayPosition } from '@/types'

export const OVERLAY_VISIBILITY_EVENT = 'habitglo:overlay-visibility'

/** Docks the LED strip full-width at the top or bottom of the primary monitor. */
export const dockOverlay = async (position: OverlayPosition, reserveSpace: boolean) => {
  if (!isTauri) return
  const { invoke } = await import('@tauri-apps/api/tauri')
  await invoke('dock_overlay', { edge: position, reserve: reserveSpace }).catch((err) => {
    console.warn('Failed to dock overlay:', err)
  })
}

export const setOverlayVisible = async (visible: boolean) => {
  if (!isTauri) return
  const { invoke } = await import('@tauri-apps/api/tauri')
  await invoke('set_overlay_visible', { visible }).catch((err) => {
    console.warn('Failed to change overlay visibility:', err)
  })
}

export const isOverlayVisible = async (): Promise<boolean> => {
  if (!isTauri) return true
  const { WebviewWindow } = await import('@tauri-apps/api/window')
  const overlayWindow = WebviewWindow.getByLabel('overlay')
  if (!overlayWindow) return false
  return overlayWindow.isVisible().catch(() => true)
}

/** Subscribes to show/hide changes from any source (app button, tray, Alt+F4). Returns an unsubscribe. */
export const onOverlayVisibilityChange = (callback: (visible: boolean) => void): (() => void) => {
  if (!isTauri) return () => {}
  let disposed = false
  let unlisten: (() => void) | undefined
  void import('@tauri-apps/api/event').then(({ listen }) =>
    listen<boolean>(OVERLAY_VISIBILITY_EVENT, ({ payload }) => callback(Boolean(payload))).then((dispose) => {
      if (disposed) dispose()
      else unlisten = dispose
    }),
  )
  return () => {
    disposed = true
    unlisten?.()
  }
}
