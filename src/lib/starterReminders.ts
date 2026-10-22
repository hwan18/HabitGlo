import { nanoid } from 'nanoid/non-secure'
import type { Habit } from '@/types'

export const STARTER_REMINDERS = [
  'DRINK WATER',
  'SIT UP STRAIGHT',
  'ONE TASK AT A TIME',
  'LOOK AWAY FOR 20 SECONDS',
  'DONE IS BETTER THAN PERFECT',
] as const

export const STARTER_SEEDED_KEY = 'habitglo-starter-seeded-v1'

/** Keys whose presence means this install already has saved data (existing users must never be re-seeded). */
const SAVED_DATA_KEYS = ['habitglo-store', 'habitglo_local_habits']

export const buildStarterHabits = (): Habit[] =>
  STARTER_REMINDERS.map((text, index) => ({
    id: nanoid(),
    text,
    colorIndex: 0,
    is_active: true,
    priority: index,
  }))

/**
 * Returns true exactly once per install: on the very first launch with no saved data.
 * Always sets the seeded flag so later launches (even with an empty list) never re-seed.
 */
export const claimFirstLaunchSeed = (storage: Storage): boolean => {
  try {
    if (storage.getItem(STARTER_SEEDED_KEY) !== null) return false
    const hasSavedData = SAVED_DATA_KEYS.some((key) => storage.getItem(key) !== null)
    storage.setItem(STARTER_SEEDED_KEY, '1')
    return !hasSavedData
  } catch {
    return false
  }
}
