/**
 * Platform detection utility.
 * Detects whether the app is running inside Tauri (desktop) or a regular browser.
 */
export const isTauri = typeof window !== 'undefined' && '__TAURI__' in window

/** True inside the LED strip window (overlay.html). The overlay only reads shared state, never writes it. */
export const isOverlayWindow =
  typeof document !== 'undefined' &&
  (document.getElementById('overlay-root') !== null || window.location.pathname.endsWith('/overlay.html'))
