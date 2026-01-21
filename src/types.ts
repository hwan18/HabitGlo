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
  speed?: number
  is_active: boolean
  priority: number
  created_at?: string
  last_done_at?: string | null
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
  clickThrough: boolean
  alwaysOnTop: boolean
  paused: boolean
  monitorIndex?: number
}
