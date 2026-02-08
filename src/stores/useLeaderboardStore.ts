import { create } from 'zustand'
import { getPersonalLeaderboard, getGlobalLeaderboard, getMyGlobalRank } from '@/lib/db'
import type { PersonalLeaderboardEntry, GlobalLeaderboardEntry, MyGlobalRank } from '@/types'

type LeaderboardState = {
  personal: PersonalLeaderboardEntry[]
  global: GlobalLeaderboardEntry[]
  myRank: MyGlobalRank
  loading: boolean
  error: string | null
  refresh: (userId: string) => Promise<void>
}

export const useLeaderboardStore = create<LeaderboardState>()((set) => ({
  personal: [],
  global: [],
  myRank: { rank: null, habit_text: null, streak_days: 0 },
  loading: false,
  error: null,

  refresh: async (userId: string) => {
    set({ loading: true, error: null })
    try {
      const [personal, global, myRank] = await Promise.all([
        getPersonalLeaderboard(userId),
        getGlobalLeaderboard(),
        getMyGlobalRank(userId),
      ])
      set({ personal, global, myRank, loading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load leaderboards'
      console.error('Leaderboard refresh failed:', message)
      set({ loading: false, error: message })
    }
  },
}))
