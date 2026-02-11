/**
 * Platform detection utility.
 * Detects whether the app is running inside Tauri (desktop) or a regular browser.
 */
export const isTauri = typeof window !== 'undefined' && '__TAURI__' in window
