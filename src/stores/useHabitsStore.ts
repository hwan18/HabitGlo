import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { isOverlayWindow } from '@/lib/platform'
import {
  computeStreak,
  fetchRemoteHabits,
  getSubscriptionStatus,
  hasLiveSessionFor,
  isSupabaseReady,
  remoteHabitsApi,
  subscribeHabits,
  type SubscriptionStatus,
} from '@/lib/db'
import { applyPendingOps, enqueue, flushQueue, readQueue, type SyncOp } from '@/lib/syncQueue'
import { hasSupabase, supabase } from '@/lib/supabaseClient'
import posthog, { identifyPostHogUser, isPostHogConfigured, resetPostHogUser } from '@/lib/posthog'
import { defaultUiThemeId, getUiThemeOverlayPalette } from '@/lib/uiThemes'
import { useLeaderboardStore } from './useLeaderboardStore'
import type { AppUser, Habit, OverlaySettings, ThemeSettings } from '@/types'
import { nanoid } from 'nanoid/non-secure'

const palettes: Record<ThemeSettings['palette'], { primary: string; secondary: string; accent: string }> = {
  classic: { primary: '#ff3131', secondary: '#ffb000', accent: '#6bff6b' },
  synthwave: { primary: '#ff5ad9', secondary: '#36d2ff', accent: '#f5ff6b' },
  focus: { primary: '#64B5F6', secondary: '#90CAF9', accent: '#BBDEFB' },
  warmAmber: { primary: '#FFB74D', secondary: '#FFCC80', accent: '#FFE0B2' },
  forest: { primary: '#81C784', secondary: '#A5D6A7', accent: '#C8E6C9' },
  lavender: { primary: '#B39DDB', secondary: '#CE93D8', accent: '#E1BEE7' },
  minimal: { primary: '#B0BEC5', secondary: '#CFD8DC', accent: '#ECEFF1' },
  sunrise: { primary: '#FF8A65', secondary: '#FFAB91', accent: '#FFF176' },
  ocean: { primary: '#4DD0E1', secondary: '#80DEEA', accent: '#B2EBF2' },
  nightOwl: { primary: '#7986CB', secondary: '#9FA8DA', accent: '#5C6BC0' },
}

const ledFonts: Record<ThemeSettings['ledFont'], { label: string; className: string; preview: string }> = {
  dotGothic: { label: 'Dot Gothic', className: 'led-font-dot', preview: 'HABITGLO' },
  silkscreen: { label: 'Silkscreen', className: 'led-font-silk', preview: 'HABITGLO' },
  pressStart: { label: 'Press Start', className: 'led-font-press', preview: 'HABITGLO' },
  vt323: { label: 'VT323', className: 'led-font-vt323', preview: 'HABITGLO' },
}

const paletteColorsForTheme = (theme: ThemeSettings) => [theme.primary, theme.secondary, theme.accent]

const normalizeHabitColor = (habit: Habit, theme: ThemeSettings) => {
  const paletteColors = paletteColorsForTheme(theme)
  const normalizedColor = habit.color?.toLowerCase()
  const inferredIndex =
    habit.colorIndex ?? paletteColors.findIndex((c) => c.toLowerCase() === normalizedColor)
  const colorIndex = inferredIndex >= 0 ? inferredIndex : 0
  const color = habit.color ?? paletteColors[colorIndex]
  return { ...habit, colorIndex, color }
}

const sortByPriority = (habits: Habit[]) => [...habits].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))

type CompletedEntry = {
  id: string
  text: string
  streak: number
  loggedAt: string
}

/**
 * Whose reminders the local list holds: a user id, `null` for signed-out (anonymous) data,
 * or `'legacy'` for data saved by an app version that did not track ownership.
 */
export type HabitsOwner = string | null

export const LEGACY_OWNER = 'legacy'
const LEGACY_LOCAL_HABITS_KEY = 'habitglo_local_habits'
export const MAX_REMINDER_LENGTH = 220

type StoreState = {
  user: AppUser | null
  authReady: boolean
  authInitializing: boolean
  subscriptionStatus: SubscriptionStatus
  subscriptionLoading: boolean
  habits: Habit[]
  habitsOwner: HabitsOwner
  completedToday: CompletedEntry[]
  theme: ThemeSettings
  overlay: OverlaySettings
  initializeAuth: () => Promise<void>
  applyAuthState: (user: AppUser | null, source?: string) => Promise<void>
  setUser: (user: AppUser | null) => Promise<void>
  refreshSubscriptionStatus: () => Promise<void>
  addHabit: (text: string, options?: Partial<Habit>) => Promise<void>
  updateHabitText: (id: string, text: string) => Promise<void>
  toggleHabit: (id: string, active: boolean) => Promise<void>
  setHabitColor: (id: string, colorIndex: number) => Promise<void>
  removeHabit: (id: string) => Promise<void>
  clearAllHabits: () => Promise<void>
  reorder: (ids: string[]) => Promise<void>
  hydrate: () => Promise<void>
  syncNow: (options?: { pull?: boolean }) => Promise<void>
  setTheme: (input: Partial<ThemeSettings>) => void
  setOverlay: (input: Partial<OverlaySettings>) => void
  markDone: (id: string) => Promise<void>
  toggleLeaderboardSharing: (enabled: boolean) => Promise<void>
}

const defaultUiThemePalette = getUiThemeOverlayPalette(defaultUiThemeId)

const defaultTheme: ThemeSettings = {
  uiThemeId: defaultUiThemeId,
  palette: 'classic',
  primary: defaultUiThemePalette.primary,
  secondary: defaultUiThemePalette.secondary,
  accent: defaultUiThemePalette.accent,
  opacity: 0.9,
  glow: 0.65,
  ledShape: 'dot',
  ledFont: 'dotGothic',
  showSeparator: true,
}

const defaultOverlay: OverlaySettings = {
  speed: 40,
  gap: 0,
  spacing: 0,
  clickThrough: false,
  alwaysOnTop: true,
  position: 'top',
  reserveSpace: true,
  paused: false,
}

// Only the main window owns persisted state; the overlay window reads it but must never write it back,
// otherwise a stale overlay snapshot can overwrite the user's latest changes.
const persistStorage: StateStorage = {
  getItem: (name) => window.localStorage.getItem(name),
  setItem: (name, value) => {
    if (isOverlayWindow) return
    try {
      window.localStorage.setItem(name, value)
    } catch (err) {
      console.warn('Failed to save HabitGlo state locally:', err)
    }
  },
  removeItem: (name) => {
    if (isOverlayWindow) return
    window.localStorage.removeItem(name)
  },
}

const isDateToday = (isoStr: string): boolean => {
  const d = new Date(isoStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

const pruneStaleCompleted = (entries: CompletedEntry[]): CompletedEntry[] =>
  entries.filter((e) => isDateToday(e.loggedAt))

const readLegacyLocalHabits = (): Habit[] => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LEGACY_LOCAL_HABITS_KEY) ?? '[]') as unknown
    return Array.isArray(parsed) ? (parsed as Habit[]).filter((h) => h && typeof h.id === 'string' && typeof h.text === 'string') : []
  } catch {
    return []
  }
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

const devAuthLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) {
    console.info('[auth]', ...args)
  }
}

let authListenerCleanup: (() => void) | null = null
let authInitPromise: Promise<void> | null = null
let authRequestEpoch = 0
let habitsSubscriptionCleanup: (() => void) | null = null
let onlineListenerInstalled = false
let syncPromise: Promise<void> | null = null
let lateRequest = false
let latePull = false
let flushTimer: ReturnType<typeof setTimeout> | null = null
let pullTimer: ReturnType<typeof setTimeout> | null = null

const MAX_SYNC_ROUNDS = 5

export const useHabitsStore = create<StoreState>()(
  persist(
    (set, get) => {
      const cleanupHabitsSubscription = () => {
        if (!habitsSubscriptionCleanup) return
        habitsSubscriptionCleanup()
        habitsSubscriptionCleanup = null
      }

      const cancelScheduledSync = () => {
        if (flushTimer) clearTimeout(flushTimer)
        if (pullTimer) clearTimeout(pullTimer)
        flushTimer = null
        pullTimer = null
      }

      const scheduleFlush = (delayMs = 400) => {
        if (!get().user || !isSupabaseReady()) return
        if (flushTimer) clearTimeout(flushTimer)
        flushTimer = setTimeout(() => {
          flushTimer = null
          void get().syncNow({ pull: false })
        }, delayMs)
      }

      const schedulePull = (delayMs = 800) => {
        if (pullTimer) clearTimeout(pullTimer)
        pullTimer = setTimeout(() => {
          pullTimer = null
          void get().syncNow({ pull: true })
        }, delayMs)
      }

      /** Local write first (instant UI + localStorage), then queue the remote change for signed-in users. */
      const commitHabits = (habits: Habit[], ops: SyncOp[]) => {
        set({ habits })
        const userId = get().user?.id
        if (!userId || !hasSupabase || ops.length === 0) return
        for (const op of ops) enqueue(userId, op)
        scheduleFlush()
      }

      const upsertOp = (habit: Habit, isNew = false): SyncOp => ({ kind: 'upsert', habit, isNew })

      const isAuthEpochCurrent = (epoch: number, userId: string | null) => {
        const currentUserId = get().user?.id ?? null
        return authRequestEpoch === epoch && currentUserId === userId
      }

      const runRefreshSubscriptionForUser = async (userId: string, epoch: number, source: string) => {
        set({ subscriptionLoading: true })
        devAuthLog('subscription:start', { source, userId, epoch })
        const subscriptionStatus = await getSubscriptionStatus(userId)
        if (!isAuthEpochCurrent(epoch, userId)) {
          devAuthLog('subscription:stale', { source, userId, epoch })
          return
        }
        set({ subscriptionStatus, subscriptionLoading: false })
        devAuthLog('subscription:end', { source, userId, epoch, subscriptionStatus })
      }

      /** Fetches the server list and merges still-pending local changes on top. */
      const pullRemote = async (userId: string) => {
        const remote = await fetchRemoteHabits(userId)
        if (get().user?.id !== userId) return
        const state = get()

        // First sign-in on this device with an empty account: keep the reminders made while signed out.
        if (state.habitsOwner === null && remote.length === 0 && state.habits.length > 0) {
          for (const habit of state.habits) enqueue(userId, upsertOp(habit, true))
          set({ habitsOwner: userId })
          return
        }

        const merged = applyPendingOps(remote, readQueue(userId)).map((habit) => normalizeHabitColor(habit, state.theme))
        if (JSON.stringify(merged) !== JSON.stringify(state.habits) || state.habitsOwner !== userId) {
          set({ habits: merged, habitsOwner: userId })
        }
      }

      const startRealtime = (userId: string) => {
        cleanupHabitsSubscription()
        habitsSubscriptionCleanup = subscribeHabits(userId, () => {
          if (get().user?.id === userId) schedulePull()
        })
      }

      const installOnlineListener = () => {
        if (onlineListenerInstalled || typeof window === 'undefined') return
        onlineListenerInstalled = true
        window.addEventListener('online', () => {
          void get().syncNow({ pull: true })
        })
      }

      return {
        user: null,
        authReady: false,
        authInitializing: false,
        subscriptionStatus: 'free',
        subscriptionLoading: false,
        habits: [],
        habitsOwner: null,
        completedToday: [],
        theme: defaultTheme,
        overlay: defaultOverlay,

        initializeAuth: async () => {
          if (get().authReady && authListenerCleanup) return
          if (authInitPromise) return authInitPromise

          authInitPromise = (async () => {
            if (!hasSupabase || !supabase) {
              cleanupHabitsSubscription()
              set({
                user: null,
                authReady: true,
                authInitializing: false,
                subscriptionStatus: 'free',
                subscriptionLoading: false,
              })
              return
            }

            installOnlineListener()

            if (!authListenerCleanup) {
              const { data } = supabase.auth.onAuthStateChange((event, session) => {
                if (
                  event === 'INITIAL_SESSION' ||
                  event === 'SIGNED_IN' ||
                  event === 'SIGNED_OUT' ||
                  event === 'TOKEN_REFRESHED' ||
                  event === 'USER_UPDATED'
                ) {
                  devAuthLog('event', event, { userId: session?.user?.id ?? null })
                  void get().applyAuthState(session?.user ?? null, `auth_event:${event}`)
                }
              })
              authListenerCleanup = () => {
                data.subscription.unsubscribe()
                authListenerCleanup = null
              }
            }

            set({ authInitializing: true })
            const { data, error } = await supabase.auth.getSession()
            if (error) {
              devAuthLog('getSession:error', error.message)
            }
            await get().applyAuthState(data.session?.user ?? null, 'initializeAuth:getSession')
          })().finally(() => {
            set({ authInitializing: false, authReady: true })
            authInitPromise = null
          })

          return authInitPromise
        },

        applyAuthState: async (user, source = 'unknown') => {
          const prevUserId = get().user?.id ?? null
          const nextUserId = user?.id ?? null

          if (prevUserId === nextUserId && get().authReady && source !== 'setUser') {
            set({ authInitializing: false, authReady: true })
            if (user && user.email !== get().user?.email) set({ user })
            devAuthLog('apply:no-op', { source, userId: nextUserId })
            // A refreshed or restored session is a good moment to push anything queued while offline.
            if (user) void get().syncNow({ pull: source.endsWith('SIGNED_IN') })
            return
          }

          const epoch = ++authRequestEpoch
          devAuthLog('apply', { source, prevUserId, nextUserId, epoch })

          if (!user) {
            if (prevUserId) resetPostHogUser()
            cleanupHabitsSubscription()
            cancelScheduledSync()
            const owner = get().habitsOwner
            // Signing out removes that account's reminders from this screen. Its unsynced changes stay queued.
            const clearLocal = Boolean(prevUserId) || (owner !== null && owner !== LEGACY_OWNER)
            set({
              user: null,
              authReady: true,
              authInitializing: false,
              subscriptionStatus: 'free',
              subscriptionLoading: false,
              ...(clearLocal ? { habits: [], habitsOwner: null, completedToday: [] } : {}),
            })
            return
          }

          if (prevUserId && prevUserId !== user.id) resetPostHogUser()
          identifyPostHogUser(user)

          const owner = get().habitsOwner
          // Never show another account's reminders while this account's list loads.
          const foreignList = owner !== null && owner !== LEGACY_OWNER && owner !== user.id
          set({
            user,
            authReady: true,
            authInitializing: false,
            ...(foreignList ? { habits: [], habitsOwner: null, completedToday: [] } : {}),
          })

          startRealtime(user.id)
          void useLeaderboardStore.getState().refresh(user.id)
          await Promise.all([
            runRefreshSubscriptionForUser(user.id, epoch, `${source}:refresh`),
            get().syncNow({ pull: true }),
          ])
        },

        setUser: async (user) => {
          await get().applyAuthState(user, 'setUser')
        },

        refreshSubscriptionStatus: async () => {
          const userId = get().user?.id ?? null
          if (!userId) {
            set({ subscriptionStatus: 'free', subscriptionLoading: false })
            return
          }
          await runRefreshSubscriptionForUser(userId, authRequestEpoch, 'manual_refresh')
        },

        hydrate: async () => {
          await get().syncNow({ pull: true })
        },

        syncNow: async (options) => {
          const userId = get().user?.id
          if (!userId || !isSupabaseReady()) return
          if (syncPromise) {
            // Served by the running sync's next round (or rescheduled when it ends).
            lateRequest = true
            latePull = latePull || Boolean(options?.pull)
            return syncPromise
          }
          lateRequest = false
          latePull = false
          let pull = Boolean(options?.pull)
          let exhausted = false

          syncPromise = (async () => {
            for (let round = 0; round < MAX_SYNC_ROUNDS; round += 1) {
              if (isOffline()) return
              if (!(await hasLiveSessionFor(userId))) return
              if (get().user?.id !== userId) return

              const result = await flushQueue(userId, remoteHabitsApi)
              if (!result.ok || get().user?.id !== userId) return

              if (pull || latePull) {
                pull = false
                latePull = false
                try {
                  await pullRemote(userId)
                } catch (err) {
                  console.warn('Background sync could not fetch reminders:', err)
                  return
                }
              }

              const moreWork = readQueue(userId).length > 0 || lateRequest || latePull
              lateRequest = false
              if (!moreWork) return
            }
            exhausted = true
          })().finally(() => {
            // Only requests that arrived during this run are retried, and only after a pause,
            // so an offline/no-session state or a change the server keeps bouncing cannot spin.
            const unserved = !exhausted && (lateRequest || latePull) && !isOffline()
            const retryPull = latePull
            syncPromise = null
            lateRequest = false
            latePull = false
            if (unserved) {
              if (retryPull) schedulePull(2000)
              else scheduleFlush(2000)
            }
          })
          return syncPromise
        },

        addHabit: async (text, options) => {
          const trimmed = text.trim().slice(0, MAX_REMINDER_LENGTH)
          if (!trimmed) return
          const { habits, theme } = get()
          const paletteColors = paletteColorsForTheme(theme)
          const inferredIndex =
            options?.colorIndex ??
            (options?.color ? paletteColors.findIndex((c) => c.toLowerCase() === options.color?.toLowerCase()) : 0)
          const colorIndex = inferredIndex >= 0 ? inferredIndex : 0
          const nextPriority = habits.reduce((max, h) => Math.max(max, h.priority ?? 0), -1) + 1
          const habit: Habit = {
            id: options?.id ?? nanoid(),
            text: trimmed,
            color: options?.color ?? paletteColors[colorIndex],
            colorIndex,
            is_active: options?.is_active ?? true,
            priority: options?.priority ?? nextPriority,
            last_done_at: null,
            streak_current: 0,
            streak_best: 0,
            show_on_leaderboard: false,
          }
          commitHabits(sortByPriority([...habits, habit]), [upsertOp(habit, true)])
          if (isPostHogConfigured) {
            posthog.capture('habit_created', { has_custom_options: Boolean(options) })
          }
        },

        updateHabitText: async (id, text) => {
          const trimmed = text.trim().slice(0, MAX_REMINDER_LENGTH)
          const found = get().habits.find((h) => h.id === id)
          if (!found || !trimmed || trimmed === found.text) return
          const updated = { ...found, text: trimmed }
          commitHabits(get().habits.map((h) => (h.id === id ? updated : h)), [upsertOp(updated)])
        },

        toggleHabit: async (id, active) => {
          const found = get().habits.find((h) => h.id === id)
          if (!found || found.is_active === active) return
          const updated = { ...found, is_active: active }
          commitHabits(get().habits.map((h) => (h.id === id ? updated : h)), [upsertOp(updated)])
          if (isPostHogConfigured) {
            posthog.capture('habit_activation_changed', { is_active: active })
          }
        },

        setHabitColor: async (id, colorIndex) => {
          const found = get().habits.find((h) => h.id === id)
          if (!found) return
          const paletteColors = paletteColorsForTheme(get().theme)
          const normalizedIndex = Math.max(0, Math.min(2, Math.round(colorIndex)))
          const updated = { ...found, colorIndex: normalizedIndex, color: paletteColors[normalizedIndex] ?? paletteColors[0] }
          commitHabits(get().habits.map((h) => (h.id === id ? updated : h)), [upsertOp(updated)])
          if (isPostHogConfigured) {
            posthog.capture('habit_color_changed', { color_index: normalizedIndex })
          }
        },

        removeHabit: async (id) => {
          if (!get().habits.some((h) => h.id === id)) return
          commitHabits(
            get().habits.filter((h) => h.id !== id),
            [{ kind: 'delete', id }],
          )
          if (isPostHogConfigured) {
            posthog.capture('habit_deleted')
          }
        },

        clearAllHabits: async () => {
          const all = get().habits
          if (all.length === 0) return
          commitHabits([], all.map((h) => ({ kind: 'delete', id: h.id }) as SyncOp))
          if (isPostHogConfigured) {
            posthog.capture('habits_cleared', { habit_count: all.length })
          }
        },

        reorder: async (ids) => {
          const prev = get().habits
          const byId = new Map(prev.map((h) => [h.id, h] as const))
          const ordered = ids.map((id) => byId.get(id)).filter((h): h is Habit => Boolean(h))
          const missing = sortByPriority(prev.filter((h) => !ids.includes(h.id)))
          const next = [...ordered, ...missing].map((h, index) => (h.priority === index ? h : { ...h, priority: index }))
          const changed = next.filter((h) => byId.get(h.id) !== h)
          if (changed.length === 0) return
          commitHabits(next, changed.map((h) => upsertOp(h)))
          if (isPostHogConfigured) {
            posthog.capture('habits_reordered', { habit_count: ids.length })
          }
        },

        setTheme: (input) => {
          const prevTheme = get().theme
          const uiThemeId = input.uiThemeId ?? prevTheme.uiThemeId ?? defaultUiThemeId
          const palette = input.palette ?? prevTheme.palette
          const paletteColors = palettes[palette]
          const overlayPalette = getUiThemeOverlayPalette(uiThemeId)
          const paletteChanged = input.palette !== undefined && input.palette !== prevTheme.palette
          const uiThemeSelected = input.uiThemeId !== undefined
          const nextTheme: ThemeSettings = {
            ...prevTheme,
            ...input,
            uiThemeId,
            primary:
              input.primary ??
              (uiThemeSelected ? overlayPalette.primary : undefined) ??
              (paletteChanged ? paletteColors.primary : prevTheme.primary),
            secondary:
              input.secondary ??
              (uiThemeSelected ? overlayPalette.secondary : undefined) ??
              (paletteChanged ? paletteColors.secondary : prevTheme.secondary),
            accent:
              input.accent ??
              (uiThemeSelected ? overlayPalette.accent : undefined) ??
              (paletteChanged ? paletteColors.accent : prevTheme.accent),
            palette,
            showSeparator: input.showSeparator ?? prevTheme.showSeparator ?? true,
          }
          const nextPaletteColors = paletteColorsForTheme(nextTheme)
          const ops: SyncOp[] = []
          const updatedHabits = get().habits.map((habit) => {
            const colorIndex = normalizeHabitColor(habit, prevTheme).colorIndex ?? 0
            const color = nextPaletteColors[colorIndex] ?? nextPaletteColors[0]
            if (habit.color === color && habit.colorIndex === colorIndex) return habit
            const updated = { ...habit, colorIndex, color }
            ops.push(upsertOp(updated))
            return updated
          })
          set({ theme: nextTheme })
          commitHabits(updatedHabits, ops)
        },

        setOverlay: (input) => {
          set({ overlay: { ...get().overlay, ...input } })
        },

        markDone: async (id) => {
          const found = get().habits.find((h) => h.id === id)
          if (!found) return
          const { streak_current, streak_best, alreadyLoggedToday } = computeStreak(
            found.last_done_at,
            found.streak_current ?? 0,
            found.streak_best ?? 0,
          )
          if (alreadyLoggedToday) return
          const loggedAt = new Date().toISOString()
          const updated = { ...found, last_done_at: loggedAt, streak_current, streak_best }
          commitHabits(get().habits.map((h) => (h.id === id ? updated : h)), [upsertOp(updated)])
          set((state) => ({
            completedToday: pruneStaleCompleted([
              ...state.completedToday,
              { id: found.id, text: found.text, streak: streak_current, loggedAt },
            ]),
          }))
          if (isPostHogConfigured) {
            posthog.capture('habit_completion_logged', { streak_current, streak_best })
          }
        },

        toggleLeaderboardSharing: async (enabled) => {
          const updatedHabits = get().habits.map((h) => ({ ...h, show_on_leaderboard: enabled }))
          commitHabits(updatedHabits, updatedHabits.map((h) => upsertOp(h)))
        },
      }
    },
    {
      name: 'habitglo-store',
      version: 3,
      storage: createJSONStorage(() => persistStorage),
      partialize: (state) => ({
        habits: state.habits,
        habitsOwner: state.habitsOwner,
        completedToday: pruneStaleCompleted(state.completedToday),
        theme: state.theme,
        overlay: state.overlay,
      }),
      migrate: (persistedState, version) => {
        const persisted = (persistedState ?? {}) as Record<string, unknown>
        const next = { ...persisted }
        delete next.user
        delete next.subscriptionStatus
        delete next.subscriptionLoading
        delete next.loading
        if (version < 3) {
          const habits = Array.isArray(next.habits) ? (next.habits as Habit[]) : []
          if (habits.length > 0) {
            next.habitsOwner = LEGACY_OWNER
          } else {
            // Signed-out users of older versions kept their list in a separate key.
            next.habits = readLegacyLocalHabits()
            next.habitsOwner = null
          }
        }
        return next
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<StoreState> | undefined
        return {
          ...currentState,
          ...persisted,
          habits: Array.isArray(persisted?.habits) ? sortByPriority(persisted.habits) : currentState.habits,
          habitsOwner: persisted?.habitsOwner ?? null,
          completedToday: pruneStaleCompleted(persisted?.completedToday ?? []),
          theme: {
            ...currentState.theme,
            ...persisted?.theme,
            showSeparator: persisted?.theme?.showSeparator ?? currentState.theme.showSeparator,
          },
          overlay: {
            ...currentState.overlay,
            ...persisted?.overlay,
          },
        }
      },
    },
  ),
)

export const palettesList = [
  { id: 'classic', label: 'Classic', colors: palettes.classic },
  { id: 'synthwave', label: 'Synthwave', colors: palettes.synthwave },
  { id: 'focus', label: 'Focus', colors: palettes.focus },
  { id: 'warmAmber', label: 'Warm Amber', colors: palettes.warmAmber },
  { id: 'forest', label: 'Forest', colors: palettes.forest },
  { id: 'lavender', label: 'Lavender', colors: palettes.lavender },
  { id: 'minimal', label: 'Minimal', colors: palettes.minimal },
  { id: 'sunrise', label: 'Sunrise', colors: palettes.sunrise },
  { id: 'ocean', label: 'Ocean', colors: palettes.ocean },
  { id: 'nightOwl', label: 'Night Owl', colors: palettes.nightOwl },
] as const

export const ledFontList = [
  { id: 'dotGothic', ...ledFonts.dotGothic },
  { id: 'silkscreen', ...ledFonts.silkscreen },
  { id: 'pressStart', ...ledFonts.pressStart },
  { id: 'vt323', ...ledFonts.vt323 },
] as const
