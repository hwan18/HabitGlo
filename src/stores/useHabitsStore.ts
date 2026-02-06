import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { reorderHabits, listHabits, upsertHabit, setHabitActive, deleteHabit, subscribeHabits, logHabit } from '@/lib/db'
import { hasSupabase } from '@/lib/supabaseClient'
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

type StoreState = {
  user: User | null
  habits: Habit[]
  loading: boolean
  theme: ThemeSettings
  overlay: OverlaySettings
  setUser: (user: User | null) => Promise<void>
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
}

const defaultTheme: ThemeSettings = {
  palette: 'classic',
  primary: palettes.classic.primary,
  secondary: palettes.classic.secondary,
  accent: palettes.classic.accent,
  opacity: 0.9,
  glow: 0.65,
  ledShape: 'dot',
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

export const useHabitsStore = create<StoreState>()(
  persist(
    (set, get) => ({
      user: null,
      habits: [],
      loading: false,
      theme: defaultTheme,
      overlay: defaultOverlay,

      setUser: async (user) => {
        set({ user })
        await get().hydrate()
      },

      hydrate: async () => {
        const userId = get().user?.id
        set({ loading: true })
        const habits = await listHabits(userId ?? undefined)
        const sorted = habits.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
        const theme = get().theme
        const normalized = sorted.map((habit) => normalizeHabitColor(habit, theme))
        set({ habits: normalized, loading: false })
        if (userId) {
          subscribeHabits(userId, async () => {
            const remote = await listHabits(userId)
            const sortedRemote = remote.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
            const theme = get().theme
            set({ habits: sortedRemote.map((habit) => normalizeHabitColor(habit, theme)) })
          })
        }
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
          speed: options?.speed ?? get().overlay.speed,
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
        await reorderHabits(ids, userId)
        set((state) => ({
          habits: ids
            .map((id, idx) => {
              const found = state.habits.find((h) => h.id === id)
              return found ? { ...found, priority: idx } : null
            })
            .filter(Boolean) as Habit[],
        }))
      },

      setTheme: (input) => {
        const prevTheme = get().theme
        const palette = input.palette ?? prevTheme.palette
        const paletteColors = palettes[palette]
        const nextTheme: ThemeSettings = {
          ...prevTheme,
          ...input,
          primary: input.primary ?? paletteColors.primary,
          secondary: input.secondary ?? paletteColors.secondary,
          accent: input.accent ?? paletteColors.accent,
          palette,
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
      },

      setOverlay: (input) => set((state) => ({ overlay: { ...state.overlay, ...input } })),

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
            // Already logged today, no state change needed
            return
          }
          const loggedAt = new Date().toISOString()
          set((state) => ({
            habits: state.habits.map((h) =>
              h.id === id ? { ...h, last_done_at: loggedAt, streak_current, streak_best } : h
            ),
          }))
        }
      },
    }),
    {
      name: 'habitglo-store',
      partialize: (state) => ({
        user: state.user,
        // Always persist habits to localStorage so overlay window can read them
        // (overlay can't share Supabase auth session with dashboard)
        habits: state.habits,
        theme: state.theme,
        overlay: state.overlay,
      }),
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
