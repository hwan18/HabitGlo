export type Palette =
  | 'classic'
  | 'synthwave'
  | 'focus'
  | 'warmAmber'
  | 'forest'
  | 'lavender'
  | 'minimal'
  | 'sunrise'
  | 'ocean'
  | 'nightOwl'
export type UiThemeId = 'citrusPoster' | 'noirBloom' | 'midnightSignal' | 'magentaPulse' | 'emberGlow' | 'matrixTerminal'
export type LedShape = 'dot' | 'square' | 'scanline'
export type LedFont = 'dotGothic' | 'silkscreen' | 'pressStart' | 'vt323'

/** Minimal signed-in user shape; a Supabase `User` satisfies it, and so does a cached offline user. */
export type AppUser = {
  id: string
  email?: string | null
}

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

export type ThemeSettings = {
  uiThemeId: UiThemeId
  palette: Palette
  primary: string
  secondary: string
  accent: string
  opacity: number
  glow: number
  ledShape: LedShape
  ledFont: LedFont
  showSeparator: boolean
}

export type OverlayPosition = 'top' | 'bottom'

export type OverlaySettings = {
  speed: number
  gap: number
  spacing: number
  clickThrough: boolean
  alwaysOnTop: boolean
  position: OverlayPosition
  reserveSpace: boolean
  paused: boolean
  monitorIndex?: number
}

export type PersonalLeaderboardEntry = {
  rank: number
  habit_text: string
  streak_days: number
}

export type GlobalLeaderboardEntry = {
  rank: number
  username: string
  habit_text: string
  streak_days: number
}

export type MyGlobalRank = {
  rank: number | null
  habit_text: string | null
  streak_days: number
}
