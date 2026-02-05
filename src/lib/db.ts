import { nanoid } from 'nanoid/non-secure'
import { supabase, hasSupabase } from './supabaseClient'
import type { Habit } from '@/types'

const LOCAL_KEY = 'habitglo_local_habits'

export const isSupabaseReady = () => hasSupabase && !!supabase

const readLocal = (): Habit[] => {
  const raw = localStorage.getItem(LOCAL_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as Habit[]
  } catch {
    return []
  }
}

const writeLocal = (habits: Habit[]) => {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(habits))
}

export const listHabits = async (userId?: string): Promise<Habit[]> => {
  if (isSupabaseReady() && userId) {
    const { data, error } = await supabase!
      .from('habits')
      .select()
      .eq('user_id', userId)
      .order('priority', { ascending: true })
    if (error) throw error
    return data as Habit[]
  }
  return readLocal()
}

export const upsertHabit = async (habit: Partial<Habit> & { text: string; user_id?: string }) => {
  if (isSupabaseReady() && habit.user_id) {
    const record = {
      id: habit.id ?? nanoid(),
      text: habit.text,
      color: habit.color ?? '#ff3131',
      speed: habit.speed ?? 40,
      is_active: habit.is_active ?? true,
      priority: habit.priority ?? 0,
      user_id: habit.user_id,
      last_done_at: habit.last_done_at ?? null,
      streak_current: habit.streak_current ?? 0,
      streak_best: habit.streak_best ?? 0,
    }
    const { data, error } = await supabase!.from('habits').upsert(record).select().single()
    if (error) throw error
    return data as Habit
  }
  const next: Habit = {
    id: habit.id ?? nanoid(),
    text: habit.text,
    color: habit.color ?? '#ff3131',
    colorIndex: habit.colorIndex,
    speed: habit.speed ?? 40,
    is_active: habit.is_active ?? true,
    priority: habit.priority ?? 0,
    last_done_at: habit.last_done_at ?? null,
    streak_current: habit.streak_current ?? 0,
    streak_best: habit.streak_best ?? 0,
  }
  const existing = readLocal()
  const idx = existing.findIndex((h) => h.id === next.id)
  if (idx >= 0) existing[idx] = next
  else existing.push(next)
  writeLocal(existing)
  return next
}

export const setHabitActive = async (habitId: string, isActive: boolean, userId?: string) => {
  if (isSupabaseReady() && userId) {
    const { error } = await supabase!.from('habits').update({ is_active: isActive }).eq('id', habitId)
    if (error) throw error
    return
  }
  const habits = readLocal().map((h) => (h.id === habitId ? { ...h, is_active: isActive } : h))
  writeLocal(habits)
}

export const reorderHabits = async (orderedIds: string[], userId?: string) => {
  if (isSupabaseReady() && userId) {
    const updates = orderedIds.map((id, index) => ({ id, priority: index }))
    const { error } = await supabase!.from('habits').upsert(updates)
    if (error) throw error
    return
  }
  const habits = readLocal()
  const byId = new Map(habits.map((h) => [h.id, h] as const))
  const reordered: Habit[] = orderedIds
    .map((id, idx) => {
      const found = byId.get(id)
      return found ? { ...found, priority: idx } : null
    })
    .filter(Boolean) as Habit[]
  writeLocal(reordered)
}

export const deleteHabit = async (habitId: string, userId?: string) => {
  if (isSupabaseReady() && userId) {
    const { error } = await supabase!.from('habits').delete().eq('id', habitId)
    if (error) throw error
    return
  }
  const habits = readLocal().filter((h) => h.id !== habitId)
  writeLocal(habits)
}

// Helper to get local date string (YYYY-MM-DD) for a given timestamp
const toLocalDateString = (isoString: string | null | undefined): string | null => {
  if (!isoString) return null
  const d = new Date(isoString)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Compute streak based on last_done_at
export const computeStreak = (
  lastDoneAt: string | null | undefined,
  currentStreak: number = 0,
  bestStreak: number = 0
): { streak_current: number; streak_best: number; alreadyLoggedToday: boolean } => {
  const now = new Date()
  const todayStr = toLocalDateString(now.toISOString())
  const lastDoneStr = toLocalDateString(lastDoneAt)

  // If already logged today, no change
  if (lastDoneStr === todayStr) {
    return { streak_current: currentStreak, streak_best: bestStreak, alreadyLoggedToday: true }
  }

  // Check if last log was yesterday
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = toLocalDateString(yesterday.toISOString())

  let newStreak: number
  if (lastDoneStr === yesterdayStr) {
    // Continue streak
    newStreak = currentStreak + 1
  } else {
    // Reset streak (first log or missed days)
    newStreak = 1
  }

  const newBest = Math.max(bestStreak, newStreak)
  return { streak_current: newStreak, streak_best: newBest, alreadyLoggedToday: false }
}

export const logHabit = async (
  habitId: string,
  userId?: string,
  currentHabit?: { last_done_at?: string | null; streak_current?: number; streak_best?: number }
): Promise<{ streak_current: number; streak_best: number; alreadyLoggedToday: boolean }> => {
  const loggedAt = new Date().toISOString()

  // Get current habit data if not provided
  let lastDoneAt = currentHabit?.last_done_at
  let streakCurrent = currentHabit?.streak_current ?? 0
  let streakBest = currentHabit?.streak_best ?? 0

  if (!currentHabit) {
    if (isSupabaseReady() && userId) {
      const { data } = await supabase!.from('habits').select('last_done_at, streak_current, streak_best').eq('id', habitId).single()
      if (data) {
        lastDoneAt = data.last_done_at
        streakCurrent = data.streak_current ?? 0
        streakBest = data.streak_best ?? 0
      }
    } else {
      const habits = readLocal()
      const found = habits.find((h) => h.id === habitId)
      if (found) {
        lastDoneAt = found.last_done_at
        streakCurrent = found.streak_current ?? 0
        streakBest = found.streak_best ?? 0
      }
    }
  }

  // Compute new streak values
  const { streak_current, streak_best, alreadyLoggedToday } = computeStreak(lastDoneAt, streakCurrent, streakBest)

  if (alreadyLoggedToday) {
    return { streak_current, streak_best, alreadyLoggedToday: true }
  }

  if (isSupabaseReady() && userId) {
    const { error: logError } = await supabase!
      .from('habit_logs')
      .insert({ habit_id: habitId, user_id: userId, logged_at: loggedAt })
    if (logError) throw logError

    const { error: updateError } = await supabase!
      .from('habits')
      .update({ last_done_at: loggedAt, streak_current, streak_best })
      .eq('id', habitId)
    if (updateError) throw updateError
    return { streak_current, streak_best, alreadyLoggedToday: false }
  }

  const habits = readLocal().map((h) =>
    h.id === habitId ? { ...h, last_done_at: loggedAt, streak_current, streak_best } : h
  )
  writeLocal(habits)
  return { streak_current, streak_best, alreadyLoggedToday: false }
}

export const subscribeHabits = (userId: string, onChange: () => void) => {
  if (!isSupabaseReady() || !userId) return () => {}
  const channel = supabase!
    .channel('habits-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'habits', filter: `user_id=eq.${userId}` },
      () => onChange(),
    )
    .subscribe()
  return () => {
    supabase!.removeChannel(channel)
  }
}
