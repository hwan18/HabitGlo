import { describe, expect, it } from 'vitest'
import { colorFromLegacyPalette, ledColorAt, speedFromLegacy, SPEED_PX_PER_SEC } from './ledSettings'

describe('speedFromLegacy', () => {
  it('maps the old slider (scrolled at value / 2 px/s) to the nearest preset', () => {
    expect(speedFromLegacy(10)).toBe('slow')
    expect(speedFromLegacy(40)).toBe('slow')
    expect(speedFromLegacy(84)).toBe('slow')
    expect(speedFromLegacy(86)).toBe('medium')
    expect(speedFromLegacy(110)).toBe('medium')
    expect(speedFromLegacy(146)).toBe('fast')
    expect(speedFromLegacy(800)).toBe('fast')
  })

  it('keeps presets and defaults anything unreadable to medium', () => {
    expect(speedFromLegacy('fast')).toBe('fast')
    expect(speedFromLegacy(undefined)).toBe('medium')
    expect(speedFromLegacy(Number.NaN)).toBe('medium')
    expect(speedFromLegacy('120')).toBe('medium')
  })

  it('uses the agreed px/s values', () => {
    expect(SPEED_PX_PER_SEC).toEqual({ slow: 30, medium: 55, fast: 90 })
  })
})

describe('colorFromLegacyPalette', () => {
  it('maps every old palette to one of the four presets', () => {
    expect(colorFromLegacyPalette('classic')).toBe('classic')
    expect(colorFromLegacyPalette('warmAmber')).toBe('classic')
    expect(colorFromLegacyPalette('synthwave')).toBe('neon')
    expect(colorFromLegacyPalette('ocean')).toBe('calm')
    expect(colorFromLegacyPalette('minimal')).toBe('mono')
    expect(colorFromLegacyPalette('unknown')).toBe('classic')
    expect(colorFromLegacyPalette(undefined)).toBe('classic')
  })
})

describe('ledColorAt', () => {
  it('cycles colors so neighbours differ', () => {
    expect(ledColorAt('neon', 0)).not.toBe(ledColorAt('neon', 1))
    expect(ledColorAt('neon', 0)).toBe(ledColorAt('neon', 2))
    expect(ledColorAt('mono', 5)).toBe(ledColorAt('mono', 0))
  })
})
