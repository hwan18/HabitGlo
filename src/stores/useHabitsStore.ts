import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { reorderHabits, listHabits, upsertHabit, setHabitActive, deleteHabit, subscribeHabits } from '@/lib/db'
import { hasSupabase } from '@/lib/supabaseClient'
import type { Habit, OverlaySettings, ThemeSettings } from '@/types'
import type { User } from '@supabase/supabase-js'
import { nanoid } from 'nanoid/non-secure'

const palettes: Record<ThemeSettings['palette'], { primary: string; secondary: string; accent: string }> = {
  classic: { primary: '#ff3131', secondary: '#ffb000', accent: '#6bff6b' },
  synthwave: { primary: '#ff5ad9', secondary: '#36d2ff', accent: '#f5ff6b' },
  custom: { primary: '#ff5ad9', secondary: '#36d2ff', accent: '#f5ff6b' },
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
  removeHabit: (id: string) => Promise<void>
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
  gap: 120,
  clickThrough: false,
  alwaysOnTop: true,
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
        set({ habits: sorted, loading: false })
        if (userId) {
          subscribeHabits(userId, async () => {
            const remote = await listHabits(userId)
            set({ habits: remote.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)) })
          })
        }
      },

      addHabit: async (text, options) => {
        const userId = get().user?.id
        const payload: Partial<Habit> & { text: string } = {
          id: options?.id ?? nanoid(),
          text,
          color: options?.color ?? get().theme.primary,
          speed: options?.speed ?? get().overlay.speed,
          is_active: options?.is_active ?? true,
          priority: options?.priority ?? get().habits.length,
          user_id: userId,
        }
        const saved = await upsertHabit(payload)
        set((state) => ({ habits: [...state.habits, saved].sort((a, b) => a.priority - b.priority) }))
      },

      toggleHabit: async (id, active) => {
        const userId = get().user?.id
        await setHabitActive(id, active, userId)
        set((state) => ({ habits: state.habits.map((h) => (h.id === id ? { ...h, is_active: active } : h)) }))
      },

      removeHabit: async (id) => {
        const userId = get().user?.id
        await deleteHabit(id, userId)
        set((state) => ({ habits: state.habits.filter((h) => h.id !== id) }))
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
        const palette = input.palette ?? get().theme.palette
        const paletteColors = palettes[palette]
        set((state) => ({
          theme: {
            ...state.theme,
            ...input,
            primary: input.primary ?? paletteColors.primary,
            secondary: input.secondary ?? paletteColors.secondary,
            accent: input.accent ?? paletteColors.accent,
            palette,
          },
        }))
      },

      setOverlay: (input) => set((state) => ({ overlay: { ...state.overlay, ...input } })),

      markDone: async (id) => {
        const userId = get().user?.id
        const found = get().habits.find((h) => h.id === id)
        if (found) {
          await upsertHabit({ ...found, last_done_at: new Date().toISOString(), user_id: userId })
          set((state) => ({
            habits: state.habits.map((h) => (h.id === id ? { ...h, last_done_at: new Date().toISOString() } : h)),
          }))
        }
      },
    }),
    {
      name: 'habitglo-store',
      partialize: (state) => ({
        habits: hasSupabase ? [] : state.habits,
        theme: state.theme,
        overlay: state.overlay,
      }),
    },
  ),
)

export const palettesList = [
  { id: 'classic', label: 'Classic', colors: palettes.classic },
  { id: 'synthwave', label: 'Synthwave', colors: palettes.synthwave },
  { id: 'custom', label: 'Custom', colors: palettes.custom },
] as const
