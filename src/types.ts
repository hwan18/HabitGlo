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
export type LedShape = 'dot' | 'square' | 'scanline'

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
}

export type ThemeSettings = {
  palette: Palette
  primary: string
  secondary: string
  accent: string
  opacity: number
  glow: number
  ledShape: LedShape
}

export type OverlaySettings = {
  speed: number
  gap: number
  spacing: number
  clickThrough: boolean
  alwaysOnTop: boolean
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
