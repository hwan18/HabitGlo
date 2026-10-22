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
    expect(store.getState().overlay.speed).toBe('medium')
    expect(store.getState().overlay.color).toBe('classic')
  })

  it('maps the old speed slider and palette to the nearest presets (v3 → v4)', async () => {
    const store = await loadStoreWith({
      'habitglo-store': JSON.stringify({
        state: {
          habits: [v2Habit],
          habitsOwner: null,
          theme: { palette: 'synthwave' },
          overlay: { speed: 120, position: 'bottom', reserveSpace: false, paused: true },
        },
        version: 3,
      }),
    })
    const { overlay, habits } = store.getState()
    expect(overlay.speed).toBe('medium')
    expect(overlay.color).toBe('neon')
    expect(overlay.position).toBe('bottom')
    expect(overlay.reserveSpace).toBe(false)
    expect(overlay.paused).toBe(true)
    expect(habits.map((h) => h.text)).toEqual(['Stretch'])
  })

  it('falls back to defaults when saved settings are corrupt', async () => {
    const store = await loadStoreWith({
      'habitglo-store': JSON.stringify({
        state: { habits: [], overlay: { speed: 'warp', color: 42, position: 'left' } },
        version: 4,
      }),
    })
    const { overlay } = store.getState()
    expect(overlay.speed).toBe('medium')
    expect(overlay.color).toBe('classic')
    expect(overlay.position).toBe('top')
  })
})
