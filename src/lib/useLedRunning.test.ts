import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { useLedRunning } from './useLedRunning'

vi.mock('@/lib/supabaseClient', () => ({ hasSupabase: false, supabase: null }))

const fire = (type: 'focus' | 'blur') =>
  act(() => {
    window.dispatchEvent(new Event(type))
  })

describe('useLedRunning', () => {
  beforeEach(() => {
    useHabitsStore.getState().setOverlay({ paused: false })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pauses the main-window preview while the window is not focused, but keeps the strip running', () => {
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const preview = renderHook(() => useLedRunning('main'))
    const strip = renderHook(() => useLedRunning('overlay'))
    expect(preview.result.current).toBe(true)
    expect(strip.result.current).toBe(true)

    hasFocus.mockReturnValue(false)
    fire('blur')
    expect(preview.result.current).toBe(false)
    expect(strip.result.current).toBe(true)

    hasFocus.mockReturnValue(true)
    fire('focus')
    expect(preview.result.current).toBe(true)
  })

  it('stops both when paused', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const preview = renderHook(() => useLedRunning('main'))
    const strip = renderHook(() => useLedRunning('overlay'))
    act(() => useHabitsStore.getState().setOverlay({ paused: true }))
    expect(preview.result.current).toBe(false)
    expect(strip.result.current).toBe(false)
  })
})
