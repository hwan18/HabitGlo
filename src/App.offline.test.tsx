import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The desktop app with the billing gate on, Supabase configured but unreachable, and the PC offline.
vi.hoisted(() => {
  vi.stubEnv('VITE_BILLING_GATE', 'true')
})

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
}))

vi.mock('@/lib/platform', () => ({ isTauri: true, isOverlayWindow: false }))
vi.mock('@/lib/overlayWindow', () => ({
  OVERLAY_VISIBILITY_EVENT: 'habitglo:overlay-visibility',
  MAIN_VISIBILITY_EVENT: 'habitglo:main-visibility',
  dockOverlay: async () => {},
  setOverlayVisible: async () => {},
  isOverlayVisible: async () => true,
  onOverlayVisibilityChange: () => () => {},
  onMainVisibilityChange: () => () => {},
  onWindowFocusChange: () => () => {},
}))
vi.mock('@/lib/supabaseClient', () => ({ hasSupabase: true, supabase: { auth } }))
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const offline = () => Promise.reject(Object.assign(new Error('TypeError: Failed to fetch'), { code: '' }))
  return {
    ...actual,
    isSupabaseReady: () => true,
    hasLiveSessionFor: async () => false,
    checkSubscriptionOnline: async () => ({ ok: false }),
    subscribeHabits: () => () => {},
    fetchRemoteHabits: offline,
    remoteHabitsApi: { upsertMany: offline, deleteMany: offline },
  }
})

const DAY = 24 * 60 * 60 * 1000

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

afterEach(() => {
  cleanup()
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true })
})

const openOffline = async (lastPaidCheckAgo: number) => {
  window.localStorage.clear()
  window.localStorage.setItem(
    'habitglo-entitlement-v1',
    JSON.stringify({ userId: 'u1', email: 'a@b.c', status: 'active', checkedAt: Date.now() - lastPaidCheckAgo }),
  )
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false })
  const { AuthRetryableFetchError } = await import('@supabase/supabase-js')
  auth.getSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) })
  vi.resetModules()
  const { useHabitsStore } = await import('./stores/useHabitsStore')
  const { isAccessGated } = await import('./lib/useAccess')
  const { default: App } = await import('./App')
  expect(isAccessGated).toBe(true)
  await useHabitsStore.getState().initializeAuth()
  render(<App />)
  return useHabitsStore
}

describe('desktop app offline', () => {
  it('opens from the cached plan and adding a reminder still works', async () => {
    const store = await openOffline(3 * DAY)
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: 'Add a reminder' }), 'Offline reminder{Enter}')

    const list = screen.getByRole('list', { name: 'Your reminders' })
    expect(within(list).getByText('Offline reminder')).toBeTruthy()
    expect(store.getState().habits.map((h) => h.text)).toContain('Offline reminder')
    expect(JSON.parse(window.localStorage.getItem('habitglo-sync-queue-v1')!).u1).toHaveLength(1)
  })

  it('asks to connect once the 14-day grace period is over', async () => {
    await openOffline(15 * DAY)
    expect(screen.getByRole('heading', { name: /Connect to the internet/ })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Add a reminder' })).toBeNull()
  })
})
