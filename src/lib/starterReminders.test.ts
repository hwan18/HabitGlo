import { describe, expect, it } from 'vitest'
import { STARTER_REMINDERS, STARTER_SEEDED_KEY, buildStarterHabits, claimFirstLaunchSeed } from './starterReminders'

describe('claimFirstLaunchSeed', () => {
  it('seeds on a truly fresh install, exactly once', () => {
    expect(claimFirstLaunchSeed(window.localStorage)).toBe(true)
    expect(window.localStorage.getItem(STARTER_SEEDED_KEY)).toBe('1')
    expect(claimFirstLaunchSeed(window.localStorage)).toBe(false)
  })

  it('never seeds existing users, even if their list is empty', () => {
    window.localStorage.setItem('habitglo-store', JSON.stringify({ state: { habits: [] }, version: 2 }))
    expect(claimFirstLaunchSeed(window.localStorage)).toBe(false)
    expect(window.localStorage.getItem(STARTER_SEEDED_KEY)).toBe('1')
  })

  it('never seeds when legacy local habits exist', () => {
    window.localStorage.setItem('habitglo_local_habits', '[]')
    expect(claimFirstLaunchSeed(window.localStorage)).toBe(false)
  })
})

describe('buildStarterHabits', () => {
  it('builds the five starters in order with unique ids and palette colors', () => {
    const habits = buildStarterHabits(['#a', '#b', '#c'])
    expect(habits.map((h) => h.text)).toEqual([...STARTER_REMINDERS])
    expect(habits.map((h) => h.priority)).toEqual([0, 1, 2, 3, 4])
    expect(new Set(habits.map((h) => h.id)).size).toBe(5)
    expect(habits.every((h) => h.is_active)).toBe(true)
    expect(habits.map((h) => h.color)).toEqual(['#a', '#b', '#c', '#a', '#b'])
  })
})
