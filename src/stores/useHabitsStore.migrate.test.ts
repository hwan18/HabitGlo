import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabaseClient', () => ({ hasSupabase: false, supabase: null }))

const loadStoreWith = async (saved: Record<string, string>) => {
  window.localStorage.clear()
  for (const [key, value] of Object.entries(saved)) window.localStorage.setItem(key, value)
  vi.resetModules()
  const { useHabitsStore } = await import('./useHabitsStore')
  return useHabitsStore
}

const v2Habit = { id: 'h1', text: 'Stretch', color: '#ff3131', colorIndex: 0, is_active: true, priority: 0 }

describe('persisted store migration', () => {
  it('keeps an existing user’s reminders and marks them as legacy-owned', async () => {
    const store = await loadStoreWith({
      'habitglo-store': JSON.stringify({ state: { habits: [v2Habit], overlay: { speed: 120 } }, version: 2 }),
    })
    expect(store.getState().habits.map((h) => h.text)).toEqual(['Stretch'])
    expect(store.getState().habitsOwner).toBe('legacy')
  })

  it('recovers signed-out reminders from the old separate key', async () => {
    const store = await loadStoreWith({
      'habitglo-store': JSON.stringify({ state: { habits: [] }, version: 2 }),
      habitglo_local_habits: JSON.stringify([v2Habit]),
    })
    expect(store.getState().habits.map((h) => h.text)).toEqual(['Stretch'])
    expect(store.getState().habitsOwner).toBeNull()
  })

  it('starts empty and unowned on a fresh install', async () => {
    const store = await loadStoreWith({})
    expect(store.getState().habits).toEqual([])
    expect(store.getState().habitsOwner).toBeNull()
    expect(store.getState().overlay.position).toBe('top')
    expect(store.getState().overlay.reserveSpace).toBe(true)
  })
})
