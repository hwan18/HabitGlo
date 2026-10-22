import { supabase, hasSupabase } from './supabaseClient'
import type { RemoteHabitsApi } from './syncQueue'
import type { Habit } from '@/types'

export const isSupabaseReady = () => hasSupabase && !!supabase

export type SubscriptionStatus =
  | 'free'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'lifetime'

export const normalizeSubscriptionStatus = (value: unknown): SubscriptionStatus => {
  switch (String(value ?? '').toLowerCase()) {
    case 'trialing':
      return 'trialing'
    case 'active':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'canceled':
      return 'canceled'
    case 'lifetime':
      return 'lifetime'
    default:
      return 'free'
  }
}

export type SubscriptionCheckResult = { ok: true; status: SubscriptionStatus } | { ok: false }

/**
 * Asks the server for the user's subscription. `ok: false` means the answer is unknown (offline,
 * no live session, server error) and must never be read as "unpaid".
 */
export const checkSubscriptionOnline = async (userId: string): Promise<SubscriptionCheckResult> => {
  if (!isSupabaseReady()) return { ok: false }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false }
  if (!(await hasLiveSessionFor(userId))) return { ok: false }
  try {
    const { data, error } = await supabase!
      .from('profiles')
      .select('subscription_status')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      console.warn('Failed to fetch subscription status:', error.message)
      return { ok: false }
    }
    return { ok: true, status: normalizeSubscriptionStatus(data?.subscription_status) }
  } catch (err) {
    console.warn('Failed to fetch subscription status:', err)
    return { ok: false }
  }
}

type HabitRow = {
  id: string
  user_id: string
  text: string
  color: string | null
  color_index: number | null
  is_active: boolean
  priority: number
  created_at: string | null
  last_done_at: string | null
  streak_current: number | null
  streak_best: number | null
  show_on_leaderboard: boolean | null
}

const fromRow = (row: HabitRow): Habit => ({
  id: row.id,
  user_id: row.user_id,
  text: row.text,
  color: row.color ?? undefined,
  colorIndex: row.color_index ?? 0,
  is_active: row.is_active,
  priority: row.priority ?? 0,
  created_at: row.created_at ?? undefined,
  last_done_at: row.last_done_at,
  streak_current: row.streak_current ?? 0,
  streak_best: row.streak_best ?? 0,
  show_on_leaderboard: row.show_on_leaderboard ?? false,
})

const toRow = (habit: Habit, userId: string) => ({
  id: habit.id,
  user_id: userId,
  text: habit.text,
  color: habit.color ?? '#ff3131',
  color_index: habit.colorIndex ?? 0,
  is_active: habit.is_active,
  priority: habit.priority ?? 0,
  last_done_at: habit.last_done_at ?? null,
  streak_current: habit.streak_current ?? 0,
  streak_best: habit.streak_best ?? 0,
  show_on_leaderboard: habit.show_on_leaderboard ?? false,
})

/** True only when Supabase has a usable session for this user (writes without one would be silently ignored by RLS). */
export const hasLiveSessionFor = async (userId: string): Promise<boolean> => {
  if (!isSupabaseReady()) return false
  try {
    const { data } = await supabase!.auth.getSession()
    return data.session?.user?.id === userId
  } catch {
    return false
  }
}

export const fetchRemoteHabits = async (userId: string): Promise<Habit[]> => {
  if (!isSupabaseReady()) throw new Error('Supabase is not configured')
  const { data, error } = await supabase!
    .from('habits')
    .select()
    .eq('user_id', userId)
    .order('priority', { ascending: true })
  if (error) throw error
  return ((data ?? []) as HabitRow[]).map(fromRow)
}

export const remoteHabitsApi: RemoteHabitsApi = {
  upsertMany: async (userId, habits) => {
    if (habits.length === 0) return
    const { error } = await supabase!.from('habits').upsert(habits.map((habit) => toRow(habit, userId)))
    if (error) throw error
  },
  deleteMany: async (userId, ids) => {
    if (ids.length === 0) return
    const { error } = await supabase!.from('habits').delete().in('id', ids).eq('user_id', userId)
    if (error) throw error
  },
}

export const subscribeHabits = (userId: string, onChange: () => void) => {
  if (!isSupabaseReady() || !userId) return () => {}
  const channel = supabase!
    .channel(`habits-changes-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'habits', filter: `user_id=eq.${userId}` },
      () => onChange(),
    )
    .subscribe()
  return () => {
    void supabase!.removeChannel(channel)
  }
}
