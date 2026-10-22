import type { ColorPreset, SpeedPreset } from '@/types'

/** Scroll speed of the LED strip in CSS pixels per second. */
export const SPEED_PX_PER_SEC: Record<SpeedPreset, number> = {
  slow: 30,
  medium: 55,
  fast: 90,
}

export const SPEED_OPTIONS: { id: SpeedPreset; label: string }[] = [
  { id: 'slow', label: 'Slow' },
  { id: 'medium', label: 'Medium' },
  { id: 'fast', label: 'Fast' },
]

export const COLOR_PRESETS: { id: ColorPreset; label: string; colors: readonly string[] }[] = [
  { id: 'classic', label: 'Classic LED', colors: ['#ff3b30', '#ffb000', '#4cff6a'] },
  { id: 'neon', label: 'Neon', colors: ['#ff4fd8', '#3ad7ff'] },
  { id: 'calm', label: 'Calm blue', colors: ['#6fb7ff', '#b3dbff'] },
  { id: 'mono', label: 'Mono white', colors: ['#f4f4f5'] },
]

export const DEFAULT_SPEED: SpeedPreset = 'medium'
export const DEFAULT_COLOR: ColorPreset = 'classic'

export const isSpeedPreset = (value: unknown): value is SpeedPreset =>
  value === 'slow' || value === 'medium' || value === 'fast'

export const isColorPreset = (value: unknown): value is ColorPreset =>
  value === 'classic' || value === 'neon' || value === 'calm' || value === 'mono'

/** Colors cycle by position in the strip, so neighbours always differ. */
export const ledColorAt = (preset: ColorPreset, index: number): string => {
  const colors = (COLOR_PRESETS.find((p) => p.id === preset) ?? COLOR_PRESETS[0]).colors
  return colors[((index % colors.length) + colors.length) % colors.length]
}

/**
 * Old versions stored a slider value (10-800) and scrolled at half of it in px/s.
 * Pick the preset closest to the speed the user actually saw.
 */
export const speedFromLegacy = (value: unknown): SpeedPreset => {
  if (isSpeedPreset(value)) return value
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SPEED
  const pxPerSec = Math.max(1, value / 2)
  let best: SpeedPreset = DEFAULT_SPEED
  let bestDistance = Infinity
  for (const [preset, px] of Object.entries(SPEED_PX_PER_SEC) as [SpeedPreset, number][]) {
    const distance = Math.abs(px - pxPerSec)
    if (distance < bestDistance) {
      best = preset
      bestDistance = distance
    }
  }
  return best
}

const LEGACY_PALETTE_TO_PRESET: Record<string, ColorPreset> = {
  classic: 'classic',
  warmAmber: 'classic',
  sunrise: 'classic',
  forest: 'classic',
  synthwave: 'neon',
  lavender: 'neon',
  focus: 'calm',
  ocean: 'calm',
  nightOwl: 'calm',
  minimal: 'mono',
}

/** Maps one of the 10 old palettes to the nearest of the 4 presets. */
export const colorFromLegacyPalette = (value: unknown): ColorPreset => {
  if (isColorPreset(value)) return value
  return (typeof value === 'string' && LEGACY_PALETTE_TO_PRESET[value]) || DEFAULT_COLOR
}
