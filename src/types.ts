/** Minimal signed-in user shape; a Supabase `User` satisfies it, and so does a cached offline user. */
export type AppUser = {
  id: string
  email?: string | null
}

/**
 * A reminder. `color`, `colorIndex`, `last_done_at`, `streak_*` and `show_on_leaderboard` are no longer
 * shown in the app but are kept so syncing never overwrites what older versions stored on the server.
 */
export type Habit = {
  id: string
  user_id?: string
  text: string
  color?: string
  colorIndex: number
  is_active: boolean
  priority: number
  created_at?: string
  last_done_at?: string | null
  streak_current?: number
  streak_best?: number
  show_on_leaderboard?: boolean
}

export type OverlayPosition = 'top' | 'bottom'
export type SpeedPreset = 'slow' | 'medium' | 'fast'
export type ColorPreset = 'classic' | 'neon' | 'calm' | 'mono'

export type OverlaySettings = {
  speed: SpeedPreset
  color: ColorPreset
  position: OverlayPosition
  reserveSpace: boolean
  paused: boolean
}
