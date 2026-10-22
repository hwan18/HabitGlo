import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useLedRunning } from './useLedRunning'

const focus = vi.hoisted(() => ({ listener: null as ((focused: boolean) => void) | null }))

vi.mock('@/lib/supabaseClient', () => ({ hasSupabase: false, supabase: null }))
vi.mock('@/lib/platform', () => ({ isTauri: true, isOverlayWindow: false }))
vi.mock('@/lib/overlayWindow', () => ({
  onOverlayVisibilityChange: () => () => {},
  onMainVisibilityChange: () => () => {},
  onWindowFocusChange: (callback: (focused: boolean) => void) => {
    focus.listener = callback
    return () => {
      focus.listener = null
    }
  },
}))

describe('useLedRunning in the desktop app', () => {
  it('follows the native window focus, not the page focus, for the preview', () => {
    // WebView2 can report the page as focused while its window is in the background.
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const preview = renderHook(() => useLedRunning('main'))
    expect(preview.result.current).toBe(true)

    act(() => focus.listener?.(false))
    expect(preview.result.current).toBe(false)

    act(() => focus.listener?.(true))
    expect(preview.result.current).toBe(true)
  })
})
