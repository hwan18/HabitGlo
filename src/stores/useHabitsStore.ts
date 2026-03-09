import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  reorderHabits,
  listHabits,
  upsertHabit,
  setHabitActive,
  deleteHabit,
  subscribeHabits,
  logHabit,
  loadSettings,
  saveSettings,
  getSubscriptionStatus,
  type SubscriptionStatus,
} from '@/lib/db'
import { hasSupabase, supabase } from '@/lib/supabaseClient'
import { defaultUiThemeId, getUiThemeOverlayPalette } from '@/lib/uiThemes'
import { useLeaderboardStore } from './useLeaderboardStore'
import type { Habit, OverlaySettings, ThemeSettings } from '@/types'
import type { User } from '@supabase/supabase-js'
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

type CompletedEntry = {
  id: string
  text: string
  streak: number
  loggedAt: string
}

type StoreState = {
  user: User | null
  authReady: boolean
  authInitializing: boolean
  subscriptionStatus: SubscriptionStatus
  subscriptionLoading: boolean
  habits: Habit[]
  completedToday: CompletedEntry[]
  loading: boolean
  theme: ThemeSettings
  overlay: OverlaySettings
  initializeAuth: () => Promise<void>
  applyAuthState: (user: User | null, source?: string) => Promise<void>
  setUser: (user: User | null) => Promise<void>
  refreshSubscriptionStatus: () => Promise<void>
  addHabit: (text: string, options?: Partial<Habit>) => Promise<void>
  toggleHabit: (id: string, active: boolean) => Promise<void>
  setHabitColor: (id: string, colorIndex: number) => Promise<void>
  removeHabit: (id: string) => Promise<void>
  clearAllHabits: () => Promise<void>
  reorder: (ids: string[]) => Promise<void>
  hydrate: () => Promise<void>
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
  reserveSpace: false,
  paused: false,
}

const isDateToday = (isoStr: string): boolean => {
  const d = new Date(isoStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

const pruneStaleCompleted = (entries: CompletedEntry[]): CompletedEntry[] =>
  entries.filter((e) => isDateToday(e.loggedAt))

const devAuthLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) {
    console.info('[auth]', ...args)
  }
}

let authListenerCleanup: (() => void) | null = null
let authInitPromise: Promise<void> | null = null
let authRequestEpoch = 0
let habitsSubscriptionCleanup: (() => void) | null = null

export const useHabitsStore = create<StoreState>()(
  persist(
    (set, get) => {
      const cleanupHabitsSubscription = () => {
        if (!habitsSubscriptionCleanup) return
        habitsSubscriptionCleanup()
        habitsSubscriptionCleanup = null
      }

      const isAuthEpochCurrent = (epoch: number, userId: string | null) => {
        const currentUserId = get().user?.id ?? null
        return authRequestEpoch === epoch && currentUserId === userId
      }

      const runRefreshSubscriptionForUser = async (
        userId: string,
        epoch: number,
        source: string,
      ) => {
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

      const runHydrateForUser = async (userId: string, epoch: number, source: string) => {
        set({ loading: true })
        devAuthLog('hydrate:start', { source, userId, epoch })

        const remote = await loadSettings(userId)
        if (!isAuthEpochCurrent(epoch, userId)) {
          devAuthLog('hydrate:stale:settings', { source, userId, epoch })
          return
        }

        if (remote) {
          if (remote.theme) set({ theme: { ...get().theme, ...remote.theme } })
          if (remote.overlay) set({ overlay: { ...get().overlay, ...remote.overlay } })
        }

        const habits = await listHabits(userId)
        if (!isAuthEpochCurrent(epoch, userId)) {
          devAuthLog('hydrate:stale:habits', { source, userId, epoch })
          return
        }

        const sorted = habits.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
        const theme = get().theme
        set({
          habits: sorted.map((habit) => normalizeHabitColor(habit, theme)),
          loading: false,
        })

        cleanupHabitsSubscription()
        habitsSubscriptionCleanup = subscribeHabits(userId, async () => {
          if (get().user?.id !== userId) return
          const remoteHabits = await listHabits(userId)
          if (get().user?.id !== userId) return
          const sortedRemote = remoteHabits.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
          const currentTheme = get().theme
          set({
            habits: sortedRemote.map((habit) => normalizeHabitColor(habit, currentTheme)),
          })
        })
        void useLeaderboardStore.getState().refresh(userId)
        devAuthLog('hydrate:end', { source, userId, epoch })
      }

      return {
        user: null,
        authReady: false,
        authInitializing: false,
        subscriptionStatus: 'free',
        subscriptionLoading: false,
        habits: [],
        completedToday: [],
        loading: false,
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
                loading: false,
              })
              await get().hydrate()
              return
            }

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
            devAuthLog('apply:no-op', { source, userId: nextUserId })
            return
          }

          const epoch = ++authRequestEpoch
          devAuthLog('apply', { source, prevUserId, nextUserId, epoch })

          if (!user) {
            cleanupHabitsSubscription()
            set({
              user: null,
              authReady: true,
              authInitializing: false,
              subscriptionStatus: 'free',
              subscriptionLoading: false,
              loading: false,
            })
            await get().hydrate()
            return
          }

          set({
            user,
            authReady: true,
            authInitializing: false,
          })

          await Promise.all([
            runRefreshSubscriptionForUser(user.id, epoch, `${source}:refresh`),
            runHydrateForUser(user.id, epoch, `${source}:hydrate`),
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
          const userId = get().user?.id ?? null
          const epoch = authRequestEpoch

          if (!userId) {
            cleanupHabitsSubscription()
            set({ loading: true })
            const habits = await listHabits(undefined)
            if (authRequestEpoch !== epoch) return
            const sorted = habits.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
            const theme = get().theme
            set({
              habits: sorted.map((habit) => normalizeHabitColor(habit, theme)),
              loading: false,
            })
            return
          }

          await runHydrateForUser(userId, epoch, 'manual_hydrate')
        },

      addHabit: async (text, options) => {
        const userId = get().user?.id
        const paletteColors = paletteColorsForTheme(get().theme)
        const inferredIndex =
          options?.colorIndex ??
          (options?.color ? paletteColors.findIndex((c) => c.toLowerCase() === options.color?.toLowerCase()) : 0)
        const colorIndex = inferredIndex >= 0 ? inferredIndex : 0
        const resolvedColor = options?.color ?? paletteColors[colorIndex]
        const payload: Partial<Habit> & { text: string } = {
          id: options?.id ?? nanoid(),
          text,
          color: resolvedColor,
          colorIndex,
          is_active: options?.is_active ?? true,
          priority: options?.priority ?? get().habits.length,
          user_id: userId,
        }
        const saved = await upsertHabit(payload)
        const normalized = normalizeHabitColor({ ...saved, color: resolvedColor, colorIndex }, get().theme)
        set((state) => ({
          habits: [...state.habits, normalized].sort((a, b) => a.priority - b.priority),
        }))
      },

      toggleHabit: async (id, active) => {
        const userId = get().user?.id
        await setHabitActive(id, active, userId)
        set((state) => ({ habits: state.habits.map((h) => (h.id === id ? { ...h, is_active: active } : h)) }))
      },

      setHabitColor: async (id, colorIndex) => {
        const found = get().habits.find((h) => h.id === id)
        if (!found) return
        const theme = get().theme
        const paletteColors = paletteColorsForTheme(theme)
        const normalizedIndex = Math.max(0, Math.min(2, Math.round(colorIndex)))
        const color = paletteColors[normalizedIndex] ?? paletteColors[0]
        const userId = get().user?.id
        const saved = await upsertHabit({
          ...found,
          color,
          colorIndex: normalizedIndex,
          user_id: userId,
        })
        const normalized = normalizeHabitColor({ ...saved, color, colorIndex: normalizedIndex }, theme)
        set((state) => ({
          habits: state.habits.map((h) => (h.id === id ? normalized : h)),
        }))
      },

      removeHabit: async (id) => {
        const userId = get().user?.id
        await deleteHabit(id, userId)
        set((state) => ({ habits: state.habits.filter((h) => h.id !== id) }))
      },

      clearAllHabits: async () => {
        const userId = get().user?.id
        const all = get().habits
        for (const habit of all) {
          await deleteHabit(habit.id, userId)
        }
        set({ habits: [] })
      },

      reorder: async (ids) => {
        const userId = get().user?.id
        const prevHabits = get().habits

        // Optimistic update: reorder immediately in UI
        set({
          habits: ids
            .map((id, idx) => {
              const found = prevHabits.find((h) => h.id === id)
              return found ? { ...found, priority: idx } : null
            })
            .filter(Boolean) as Habit[],
        })

        // Persist to backend
        try {
          await reorderHabits(ids, userId)
        } catch (err) {
          console.error('Failed to persist reorder:', err)
          // Rollback to previous order on failure
          set({ habits: prevHabits })
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
        const updatedHabits = get().habits.map((habit) => {
          const normalized = normalizeHabitColor(habit, prevTheme)
          const colorIndex = normalized.colorIndex ?? 0
          const color = nextPaletteColors[colorIndex] ?? nextPaletteColors[0]
          return { ...habit, colorIndex, color }
        })
        set({ theme: nextTheme, habits: updatedHabits })
        const userId = get().user?.id
        updatedHabits.forEach((habit) => {
          void upsertHabit({ ...habit, user_id: userId, text: habit.text, color: habit.color })
        })
        // Sync settings to Supabase
        if (userId) {
          void saveSettings(userId, { theme: nextTheme, overlay: get().overlay })
        }
      },

      setOverlay: (input) => {
        const nextOverlay = { ...get().overlay, ...input }
        set({ overlay: nextOverlay })
        // Sync settings to Supabase
        const userId = get().user?.id
        if (userId) {
          void saveSettings(userId, { theme: get().theme, overlay: nextOverlay })
        }
      },

      markDone: async (id) => {
        const userId = get().user?.id
        const found = get().habits.find((h) => h.id === id)
        if (found) {
          const { streak_current, streak_best, alreadyLoggedToday } = await logHabit(id, userId, {
            last_done_at: found.last_done_at,
            streak_current: found.streak_current ?? 0,
            streak_best: found.streak_best ?? 0,
          })
          if (alreadyLoggedToday) {
            return
          }
          const loggedAt = new Date().toISOString()
          set((state) => ({
            habits: state.habits.map((h) =>
              h.id === id ? { ...h, last_done_at: loggedAt, streak_current, streak_best } : h
            ),
            completedToday: pruneStaleCompleted([
              ...state.completedToday,
              { id: found.id, text: found.text, streak: streak_current, loggedAt },
            ]),
          }))
          // Refresh leaderboards after logging a habit
          if (userId) {
            void useLeaderboardStore.getState().refresh(userId)
          }
        }
      },

        toggleLeaderboardSharing: async (enabled) => {
          const userId = get().user?.id
          const updatedHabits = get().habits.map((h) => ({ ...h, show_on_leaderboard: enabled }))
          set({ habits: updatedHabits })
          // Persist to database
          for (const habit of updatedHabits) {
            await upsertHabit({ ...habit, user_id: userId, text: habit.text })
          }
          // Refresh leaderboard after toggling
          if (userId) {
            void useLeaderboardStore.getState().refresh(userId)
          }
        },
      }
    },
    {
      name: 'habitglo-store',
      version: 2,
      partialize: (state) => ({
        // Always persist habits to localStorage so overlay window can read them
        // (overlay can't share Supabase auth session with dashboard)
        habits: state.habits,
        completedToday: pruneStaleCompleted(state.completedToday),
        theme: state.theme,
        overlay: state.overlay,
      }),
      migrate: (persistedState) => {
        const persisted = (persistedState ?? {}) as Record<string, unknown>
        const next = { ...persisted }
        delete next.user
        delete next.subscriptionStatus
        delete next.subscriptionLoading
        return next
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<StoreState> | undefined
        return {
          ...currentState,
          ...persisted,
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
