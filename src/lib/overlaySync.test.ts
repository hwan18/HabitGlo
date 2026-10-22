import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OVERLAY_READY_EVENT, OVERLAY_SYNC_EVENT, startOverlaySync, type OverlaySyncPayload, type SyncTransport } from './overlaySync'
import type { Habit, OverlaySettings } from '@/types'

type State = { overlay: OverlaySettings; habits: Habit[]; user: { id: string } | null; subscriptionStatus: string }

const makeStore = (initial: State) => {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set: (patch: Partial<State>) => {
      state = { ...state, ...patch }
      listeners.forEach((l) => l())
    },
  }
}

const makeTransport = () => {
  const sent: OverlaySyncPayload[] = []
  const handlers = new Map<string, () => void>()
  const transport: SyncTransport = {
    emit: (event, payload) => {
      if (event === OVERLAY_SYNC_EVENT) sent.push(payload)
    },
    listen: (event, handler) => {
      handlers.set(event, handler)
      return () => handlers.delete(event)
    },
  }
  return { transport, sent, fire: (event: string) => handlers.get(event)?.() }
}

const overlay: OverlaySettings = { speed: 'medium', color: 'classic', position: 'top', reserveSpace: true, paused: false }
const habit = (id: string, text: string): Habit => ({ id, text, colorIndex: 0, is_active: true, priority: 0 })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('startOverlaySync', () => {
  it('sends the current state immediately, then one message per burst of changes', () => {
    const store = makeStore({ overlay, habits: [habit('a', 'A')], user: null, subscriptionStatus: 'free' })
    const { transport, sent } = makeTransport()
    startOverlaySync(store, transport, 80)
    expect(sent).toHaveLength(1)

    store.set({ habits: [habit('a', 'AB')] })
    store.set({ habits: [habit('a', 'ABC')] })
    store.set({ overlay: { ...overlay, speed: 'fast' } })
    vi.advanceTimersByTime(79)
    expect(sent).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(sent).toHaveLength(2)
    expect(sent[1].habits[0].text).toBe('ABC')
    expect(sent[1].overlay.speed).toBe('fast')
  })

  it('ignores changes the strip does not show', () => {
    const store = makeStore({ overlay, habits: [habit('a', 'A')], user: null, subscriptionStatus: 'free' })
    const { transport, sent } = makeTransport()
    startOverlaySync(store, transport, 80)
    store.set({ subscriptionStatus: 'active' })
    // A new array with the same visible content (e.g. a streak synced from the server).
    store.set({ habits: [{ ...habit('a', 'A'), streak_current: 9 }] })
    vi.advanceTimersByTime(500)
    expect(sent).toHaveLength(1)
    expect(sent[0].habits[0]).toEqual({ id: 'a', text: 'A', is_active: true, priority: 0, colorIndex: 0 })
  })

  it('always answers an overlay that just started listening', () => {
    const store = makeStore({ overlay, habits: [], user: { id: 'u1' }, subscriptionStatus: 'free' })
    const { transport, sent, fire } = makeTransport()
    startOverlaySync(store, transport, 80)
    fire(OVERLAY_READY_EVENT)
    fire(OVERLAY_READY_EVENT)
    expect(sent).toHaveLength(3)
    expect(sent[2].userId).toBe('u1')
  })

  it('stops cleanly', () => {
    const store = makeStore({ overlay, habits: [], user: null, subscriptionStatus: 'free' })
    const { transport, sent, fire } = makeTransport()
    const stop = startOverlaySync(store, transport, 80)
    store.set({ habits: [habit('a', 'A')] })
    stop()
    vi.advanceTimersByTime(500)
    fire(OVERLAY_READY_EVENT)
    expect(sent).toHaveLength(1)
  })
})
