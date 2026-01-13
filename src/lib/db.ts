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
    }
    const { data, error } = await supabase!.from('habits').upsert(record).select().single()
    if (error) throw error
    return data as Habit
  }
  const next: Habit = {
    id: habit.id ?? nanoid(),
    text: habit.text,
    color: habit.color ?? '#ff3131',
    speed: habit.speed ?? 40,
    is_active: habit.is_active ?? true,
    priority: habit.priority ?? 0,
    last_done_at: habit.last_done_at ?? null,
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
