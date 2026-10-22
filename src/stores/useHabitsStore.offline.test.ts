import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluateAccess } from '@/lib/entitlement'

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
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

const startOffline = async (cacheAgeMs: number | null) => {
  window.localStorage.clear()
  if (cacheAgeMs !== null) {
    window.localStorage.setItem(
      'habitglo-entitlement-v1',
      JSON.stringify({ userId: 'u1', email: 'a@b.c', status: 'active', checkedAt: Date.now() - cacheAgeMs }),
    )
  }
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false })
  const { AuthRetryableFetchError } = await import('@supabase/supabase-js')
  auth.getSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) })
  vi.resetModules()
  const { useHabitsStore } = await import('./useHabitsStore')
  await useHabitsStore.getState().initializeAuth()
  const s = useHabitsStore.getState()
  const access = evaluateAccess({
    gated: true,
    authReady: s.authReady,
    online: false,
    user: s.user,
    check: s.subscriptionCheck,
    status: s.subscriptionStatus,
    cache: s.cachedEntitlement,
    now: Date.now(),
  })
  return { useHabitsStore, access }
}

afterEach(() => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true })
})

describe('offline start with a stored but expired session', () => {
  it('opens as the cached user within the grace period and reminders still work', async () => {
    const { useHabitsStore, access } = await startOffline(3 * DAY)
    expect(access).toEqual({ kind: 'open', via: 'grace' })
    expect(useHabitsStore.getState().user).toEqual({ id: 'u1', email: 'a@b.c' })
    expect(useHabitsStore.getState().offlineSession).toBe(true)
    expect(useHabitsStore.getState().subscriptionCheck).toBe('failed')

    await useHabitsStore.getState().addHabit('Works offline')
    expect(useHabitsStore.getState().habits.map((h) => h.text)).toContain('Works offline')
    const queued = JSON.parse(window.localStorage.getItem('habitglo-sync-queue-v1')!)
    expect(queued.u1).toHaveLength(1)
  })

  it('asks to connect once the grace period is over', async () => {
    const { access } = await startOffline(15 * DAY)
    expect(access).toEqual({ kind: 'verify-offline', showSignIn: false })
  })

  it('asks to connect and sign in when there is no cached user', async () => {
    const { useHabitsStore, access } = await startOffline(null)
    expect(useHabitsStore.getState().user).toBeNull()
    expect(access).toEqual({ kind: 'verify-offline', showSignIn: true })
  })

  it('signing out offline still signs out locally and drops the grace', async () => {
    const { useHabitsStore } = await startOffline(3 * DAY)
    window.localStorage.setItem('sb-abc-auth-token', '{}')
    auth.signOut.mockResolvedValue({ error: new Error('Failed to fetch') })
    await useHabitsStore.getState().signOut()
    expect(useHabitsStore.getState().user).toBeNull()
    expect(window.localStorage.getItem('sb-abc-auth-token')).toBeNull()
    expect(window.localStorage.getItem('habitglo-entitlement-v1')).toBeNull()
  })
})
