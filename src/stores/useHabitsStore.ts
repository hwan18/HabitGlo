import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { isOverlayWindow } from '@/lib/platform'
import {
  checkSubscriptionOnline,
  fetchRemoteHabits,
  hasLiveSessionFor,
  isSupabaseReady,
  remoteHabitsApi,
  subscribeHabits,
  type SubscriptionStatus,
} from '@/lib/db'
import {
  clearCachedEntitlement,
  readCachedEntitlement,
  writeCachedEntitlement,
  type CachedEntitlement,
  type SubscriptionCheck,
} from '@/lib/entitlement'
import {
  colorFromLegacyPalette,
  DEFAULT_COLOR,
  DEFAULT_SPEED,
  isColorPreset,
  isSpeedPreset,
  speedFromLegacy,
} from '@/lib/ledSettings'
import { applyPendingOps, enqueue, flushQueue, readQueue, type SyncOp } from '@/lib/syncQueue'
import { hasSupabase, supabase } from '@/lib/supabaseClient'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import posthog, { identifyPostHogUser, isPostHogConfigured, resetPostHogUser } from '@/lib/posthog'
import type { AppUser, Habit, OverlaySettings } from '@/types'
import { nanoid } from 'nanoid/non-secure'

const sortByPriority = (habits: Habit[]) => [...habits].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))

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
  /** Last known status: from the server when `subscriptionCheck` is `ok`, otherwise from the offline cache. */
  subscriptionStatus: SubscriptionStatus
  subscriptionCheck: SubscriptionCheck
  /** Signed in from the cached entitlement because the session could not be restored (offline). */
  offlineSession: boolean
  cachedEntitlement: CachedEntitlement | null
  habits: Habit[]
  habitsOwner: HabitsOwner
  overlay: OverlaySettings
  initializeAuth: () => Promise<void>
  applyAuthState: (user: AppUser | null, source?: string) => Promise<void>
  setUser: (user: AppUser | null) => Promise<void>
  /** Re-verifies the subscription (and tries to restore the session first when offline-signed-in). */
  refreshSubscriptionStatus: () => Promise<void>
  signOut: () => Promise<void>
  addHabit: (text: string, options?: Partial<Habit>) => Promise<void>
  updateHabitText: (id: string, text: string) => Promise<void>
  toggleHabit: (id: string, active: boolean) => Promise<void>
  removeHabit: (id: string) => Promise<void>
  reorder: (ids: string[]) => Promise<void>
  syncNow: (options?: { pull?: boolean }) => Promise<void>
  setOverlay: (input: Partial<OverlaySettings>) => void
}

const defaultOverlay: OverlaySettings = {
  speed: DEFAULT_SPEED,
  color: DEFAULT_COLOR,
  position: 'top',
  reserveSpace: true,
  paused: false,
}

/** Builds clean settings from whatever was saved; unknown or removed fields are dropped. */
const sanitizeOverlay = (saved: unknown): OverlaySettings => {
  const overlay = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>
  return {
    speed: isSpeedPreset(overlay.speed) ? overlay.speed : speedFromLegacy(overlay.speed),
    color: isColorPreset(overlay.color) ? overlay.color : DEFAULT_COLOR,
    position: overlay.position === 'bottom' ? 'bottom' : 'top',
    reserveSpace: overlay.reserveSpace !== false,
    paused: overlay.paused === true,
  }
}

/** Keeps every saved reminder that has an id and text, filling in fields older versions may lack. */
const restoreHabits = (saved: unknown): Habit[] => {
  if (!Array.isArray(saved)) return []
  const habits = saved.filter(
    (h): h is Habit => Boolean(h) && typeof h.id === 'string' && typeof h.text === 'string',
  )
  return sortByPriority(
    habits.map((h, index) => ({
      ...h,
      colorIndex: typeof h.colorIndex === 'number' ? h.colorIndex : 0,
      is_active: h.is_active !== false,
      priority: typeof h.priority === 'number' && Number.isFinite(h.priority) ? h.priority : index,
    })),
  )
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

      /** Online subscription check; caches the answer for offline starts. A failed check never means "unpaid". */
      const runSubscriptionCheck = async (user: AppUser, epoch: number, source: string) => {
        set({ subscriptionCheck: 'pending' })
        devAuthLog('subscription:start', { source, userId: user.id, epoch })
        const result = await checkSubscriptionOnline(user.id)
        if (!isAuthEpochCurrent(epoch, user.id)) {
          devAuthLog('subscription:stale', { source, userId: user.id, epoch })
          return
        }
        if (result.ok) {
          const entry: CachedEntitlement = {
            userId: user.id,
            email: user.email ?? get().cachedEntitlement?.email ?? null,
            status: result.status,
            checkedAt: Date.now(),
          }
          writeCachedEntitlement(entry)
          set({ subscriptionStatus: result.status, subscriptionCheck: 'ok', cachedEntitlement: entry })
        } else {
          const cache = get().cachedEntitlement
          set({
            subscriptionCheck: 'failed',
            subscriptionStatus: cache?.userId === user.id ? cache.status : get().subscriptionStatus,
          })
        }
        devAuthLog('subscription:end', { source, userId: user.id, epoch, ok: result.ok })
      }

      /** Called when a real Supabase session appears for the user we were showing from the offline cache. */
      const recoverFromOfflineSession = (user: AppUser, source: string) => {
        set({ user, offlineSession: false })
        startRealtime(user.id)
        void runSubscriptionCheck(user, authRequestEpoch, `${source}:recovered`)
        void get().syncNow({ pull: true })
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

        const merged = applyPendingOps(remote, readQueue(userId))
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
          const { user, subscriptionCheck, offlineSession } = get()
          if (user && (subscriptionCheck === 'failed' || offlineSession)) void get().refreshSubscriptionStatus()
          void get().syncNow({ pull: true })
        })
      }

      return {
        user: null,
        authReady: false,
        authInitializing: false,
        subscriptionStatus: 'free',
        subscriptionCheck: 'idle',
        offlineSession: false,
        cachedEntitlement: isOverlayWindow ? null : readCachedEntitlement(),
        habits: [],
        habitsOwner: null,
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
                subscriptionCheck: 'idle',
              })
              return
            }

            installOnlineListener()

            if (!authListenerCleanup) {
              // INITIAL_SESSION is not handled: offline it reports "no session" even though the session is
              // still stored, which would sign the user out. The startup state comes from getSession below.
              const { data } = supabase.auth.onAuthStateChange((event, session) => {
                if (
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
            let sessionUser: AppUser | null = null
            let networkProblem = isOffline()
            try {
              const { data, error } = await supabase.auth.getSession()
              sessionUser = data.session?.user ?? null
              if (error) {
                devAuthLog('getSession:error', error.message)
                networkProblem = networkProblem || isAuthRetryableFetchError(error)
              }
            } catch (err) {
              devAuthLog('getSession:threw', err)
              networkProblem = true
            }

            const cache = get().cachedEntitlement
            if (!sessionUser && networkProblem && cache) {
              // The stored session could not be refreshed without a network. Open as the cached user;
              // supabase-js keeps the session and will refresh it once the connection is back.
              set({ offlineSession: true })
              await get().applyAuthState({ id: cache.userId, email: cache.email }, 'offline-cache')
              return
            }
            await get().applyAuthState(sessionUser, 'initializeAuth:getSession')
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
            if (user && get().offlineSession && source !== 'offline-cache') {
              devAuthLog('apply:recovered', { source, userId: nextUserId })
              recoverFromOfflineSession(user, source)
              return
            }
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
            // No session for real (not a network problem): the offline grace must not outlive the sign-out.
            clearCachedEntitlement()
            set({
              user: null,
              authReady: true,
              authInitializing: false,
              offlineSession: false,
              subscriptionStatus: 'free',
              subscriptionCheck: 'idle',
              cachedEntitlement: null,
              ...(clearLocal ? { habits: [], habitsOwner: null } : {}),
            })
            return
          }

          if (prevUserId && prevUserId !== user.id) resetPostHogUser()
          identifyPostHogUser(user)

          const owner = get().habitsOwner
          // Never show another account's reminders while this account's list loads.
          const foreignList = owner !== null && owner !== LEGACY_OWNER && owner !== user.id
          const cache = get().cachedEntitlement
          set({
            user,
            authReady: true,
            authInitializing: false,
            offlineSession: source === 'offline-cache',
            subscriptionStatus: cache?.userId === user.id ? cache.status : 'free',
            subscriptionCheck: 'idle',
            ...(foreignList ? { habits: [], habitsOwner: null } : {}),
          })

          if (source !== 'offline-cache') startRealtime(user.id)
          await Promise.all([
            runSubscriptionCheck(user, epoch, `${source}:refresh`),
            get().syncNow({ pull: true }),
          ])
        },

        setUser: async (user) => {
          await get().applyAuthState(user, 'setUser')
        },

        refreshSubscriptionStatus: async () => {
          if (supabase && (!get().user || get().offlineSession)) {
            // Retry restoring the session first; a recovered session runs its own check.
            const result = await supabase.auth.getSession().catch(() => null)
            const sessionUser = result?.data.session?.user ?? null
            if (sessionUser) {
              await get().applyAuthState(sessionUser, 'retry')
              return
            }
          }
          const user = get().user
          if (!user) return
          await runSubscriptionCheck(user, authRequestEpoch, 'manual_refresh')
        },

        signOut: async () => {
          if (!supabase) return
          let failed = false
          try {
            const { error } = await supabase.auth.signOut({ scope: 'local' })
            failed = Boolean(error)
          } catch {
            failed = true
          }
          if (failed) {
            // Offline: supabase-js keeps the session when the server call fails. Drop it on this device anyway.
            for (const key of Object.keys(window.localStorage)) {
              if (key.startsWith('sb-') && key.includes('-auth-token')) window.localStorage.removeItem(key)
            }
          }
          await get().applyAuthState(null, 'signOut')
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
          const { habits } = get()
          const nextPriority = habits.reduce((max, h) => Math.max(max, h.priority ?? 0), -1) + 1
          const habit: Habit = {
            id: options?.id ?? nanoid(),
            text: trimmed,
            color: options?.color,
            colorIndex: options?.colorIndex ?? 0,
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

        setOverlay: (input) => {
          set({ overlay: sanitizeOverlay({ ...get().overlay, ...input }) })
        },
      }
    },
    {
      name: 'habitglo-store',
      version: 5,
      storage: createJSONStorage(() => persistStorage),
      partialize: (state) => ({
        habits: state.habits,
        habitsOwner: state.habitsOwner,
        overlay: state.overlay,
      }),
      migrate: (persistedState, version) => {
        const next = { ...((persistedState ?? {}) as Record<string, unknown>) }
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
        if (version < 4) {
          const overlay = (next.overlay ?? {}) as Record<string, unknown>
          const theme = (next.theme ?? {}) as Record<string, unknown>
          next.overlay = {
            ...overlay,
            speed: speedFromLegacy(overlay.speed),
            color: colorFromLegacyPalette(theme.palette),
          }
        }
        // v5 dropped the theme, streak log, leaderboard and old overlay fields; merge keeps only known keys.
        return next
      },
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Record<string, unknown>
        const owner = persisted.habitsOwner
        return {
          ...currentState,
          habits: Array.isArray(persisted.habits) ? restoreHabits(persisted.habits) : currentState.habits,
          habitsOwner: typeof owner === 'string' ? owner : null,
          overlay: sanitizeOverlay(persisted.overlay),
        }
      },
    },
  ),
)