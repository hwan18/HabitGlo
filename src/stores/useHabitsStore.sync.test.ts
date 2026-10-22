import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Habit } from '@/types'

// In-memory stand-in for the Supabase `habits` table.
const server = vi.hoisted(() => ({
  rows: new Map<string, Habit>(),
  online: true,
  session: true,
  requests: 0,
}))

const offlineError = () => Object.assign(new Error('TypeError: Failed to fetch'), { code: '' })

vi.mock('@/lib/supabaseClient', () => ({ hasSupabase: true, supabase: null }))

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const guard = () => {
    server.requests += 1
    if (!server.online) throw offlineError()
  }
  return {
    ...actual,
    isSupabaseReady: () => true,
    hasLiveSessionFor: async () => server.session,
    getSubscriptionStatus: async () => 'active',
    subscribeHabits: () => () => {},
    fetchRemoteHabits: async () => {
      guard()
      return [...server.rows.values()].map((h) => ({ ...h }))
    },
    remoteHabitsApi: {
      upsertMany: async (_userId: string, habits: Habit[]) => {
        guard()
        for (const h of habits) server.rows.set(h.id, { ...h })
      },
      deleteMany: async (_userId: string, ids: string[]) => {
        guard()
        for (const id of ids) server.rows.delete(id)
      },
    },
  }
})

vi.mock('./useLeaderboardStore', () => ({ useLeaderboardStore: { getState: () => ({ refresh: async () => {} }) } }))

const { useHabitsStore } = await import('./useHabitsStore')
const { readQueue } = await import('@/lib/syncQueue')

const setOnline = (value: boolean) => {
  server.online = value
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value })
}

const texts = () => useHabitsStore.getState().habits.map((h) => h.text)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  server.rows.clear()
  server.requests = 0
  server.session = true
  setOnline(true)
  useHabitsStore.setState({ user: { id: 'u1', email: 'a@b.c' }, habits: [], habitsOwner: 'u1', authReady: true })
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  useHabitsStore.setState({ user: null, habits: [], habitsOwner: null })
})

describe('local-first habits with background sync', () => {
  it('adds offline instantly, then flushes once back online', async () => {
    setOnline(false)
    await useHabitsStore.getState().addHabit('Drink water')

    expect(texts()).toEqual(['Drink water'])
    expect(JSON.parse(window.localStorage.getItem('habitglo-store')!).state.habits).toHaveLength(1)
    expect(readQueue('u1')).toHaveLength(1)

    await useHabitsStore.getState().syncNow({ pull: true })
    expect(server.requests).toBe(0)
    expect(readQueue('u1')).toHaveLength(1)

    setOnline(true)
    await useHabitsStore.getState().syncNow({ pull: true })
    expect([...server.rows.values()].map((h) => h.text)).toEqual(['Drink water'])
    expect(readQueue('u1')).toEqual([])
    expect(texts()).toEqual(['Drink water'])
  })

  it('never sends anything for an item added and deleted while offline', async () => {
    setOnline(false)
    await useHabitsStore.getState().addHabit('Temporary')
    const id = useHabitsStore.getState().habits[0].id
    await useHabitsStore.getState().removeHabit(id)

    expect(texts()).toEqual([])
    expect(readQueue('u1')).toEqual([])

    setOnline(true)
    await useHabitsStore.getState().syncNow({ pull: false })
    expect(server.requests).toBe(0)
    expect(server.rows.size).toBe(0)
  })

  it('reorders offline and pushes the new order when online', async () => {
    for (const text of ['A', 'B', 'C']) await useHabitsStore.getState().addHabit(text)
    await useHabitsStore.getState().syncNow({ pull: false })
    expect(readQueue('u1')).toEqual([])

    setOnline(false)
    const [a, b, c] = useHabitsStore.getState().habits
    await useHabitsStore.getState().reorder([c.id, a.id, b.id])
    expect(texts()).toEqual(['C', 'A', 'B'])
    expect(readQueue('u1')).toHaveLength(3)

    setOnline(true)
    await useHabitsStore.getState().syncNow({ pull: true })
    const remoteOrder = [...server.rows.values()].sort((x, y) => x.priority - y.priority).map((h) => h.text)
    expect(remoteOrder).toEqual(['C', 'A', 'B'])
    expect(texts()).toEqual(['C', 'A', 'B'])
  })

  it('takes the server as truth when nothing is pending', async () => {
    server.rows.set('r1', { id: 'r1', text: 'From another device', colorIndex: 0, is_active: true, priority: 0 })
    useHabitsStore.setState({ habits: [{ id: 'old', text: 'Stale', colorIndex: 0, is_active: true, priority: 0 }] })
    await useHabitsStore.getState().syncNow({ pull: true })
    expect(texts()).toEqual(['From another device'])
  })

  it('flushes pending changes before fetching so they are not lost', async () => {
    server.rows.set('r1', { id: 'r1', text: 'Remote', colorIndex: 0, is_active: true, priority: 0 })
    useHabitsStore.setState({ habits: [{ id: 'r1', text: 'Remote', colorIndex: 0, is_active: true, priority: 0 }] })
    setOnline(false)
    await useHabitsStore.getState().addHabit('Local only')
    setOnline(true)
    await useHabitsStore.getState().syncNow({ pull: true })
    expect(texts()).toEqual(['Remote', 'Local only'])
    expect(server.rows.size).toBe(2)
  })

  it('does not push without a live session (the server would silently ignore it)', async () => {
    server.session = false
    await useHabitsStore.getState().addHabit('Queued')
    await useHabitsStore.getState().syncNow({ pull: false })
    expect(server.rows.size).toBe(0)
    expect(readQueue('u1')).toHaveLength(1)
  })

  it('uploads reminders made while signed out to an empty account', async () => {
    useHabitsStore.setState({
      habitsOwner: null,
      habits: [{ id: 's1', text: 'DRINK WATER', colorIndex: 0, is_active: true, priority: 0 }],
    })
    await useHabitsStore.getState().syncNow({ pull: true })
    expect([...server.rows.keys()]).toEqual(['s1'])
    expect(useHabitsStore.getState().habitsOwner).toBe('u1')
    expect(texts()).toEqual(['DRINK WATER'])
  })

  it('handles long and non-Latin reminder text', async () => {
    await useHabitsStore.getState().addHabit('물 마시기 · 水を飲む · Пей воду')
    await useHabitsStore.getState().addHabit('x'.repeat(500))
    expect(texts()[0]).toBe('물 마시기 · 水を飲む · Пей воду')
    expect(texts()[1]).toHaveLength(220)
    await useHabitsStore.getState().addHabit('   ')
    expect(texts()).toHaveLength(2)
  })
})
