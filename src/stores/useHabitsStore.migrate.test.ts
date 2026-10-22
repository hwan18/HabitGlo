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

  it('drops removed settings (v4 → v5) without losing any reminder', async () => {
    const store = await loadStoreWith({
      'habitglo-store': JSON.stringify({
        state: {
          habits: [
            { ...v2Habit, streak_current: 12, show_on_leaderboard: true },
            { id: 'h2', text: '물 마시기', priority: 1 },
            { id: 'h3', text: 'Paused one', is_active: false, priority: 2, colorIndex: 2 },
            { id: 'broken' },
          ],
          habitsOwner: 'user-1',
          completedToday: [{ id: 'h1', text: 'Stretch', streak: 3, loggedAt: new Date().toISOString() }],
          theme: { uiThemeId: 'noirBloom', palette: 'ocean', glow: 1, ledFont: 'vt323', showSeparator: false },
          overlay: { speed: 'fast', color: 'calm', gap: 40, spacing: 8, clickThrough: true, alwaysOnTop: false, position: 'bottom', reserveSpace: true, paused: false, monitorIndex: 1 },
        },
        version: 4,
      }),
    })
    const state = store.getState() as unknown as Record<string, unknown>
    expect(state.theme).toBeUndefined()
    expect(state.completedToday).toBeUndefined()
    expect(store.getState().overlay).toEqual({ speed: 'fast', color: 'calm', position: 'bottom', reserveSpace: true, paused: false })
    expect(store.getState().habitsOwner).toBe('user-1')
    const habits = store.getState().habits
    expect(habits.map((h) => h.text)).toEqual(['Stretch', '물 마시기', 'Paused one'])
    expect(habits.map((h) => h.is_active)).toEqual([true, true, false])
    // Server-side fields from older versions are carried along so syncing never resets them.
    expect(habits[0].streak_current).toBe(12)
    expect(habits[0].show_on_leaderboard).toBe(true)
    expect(habits[1].colorIndex).toBe(0)
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
