import { describe, expect, it } from 'vitest'
import { splitScriptRuns } from '@/overlay/fontRouting'

describe('smoke', () => {
  it('runs in a DOM environment with localStorage', () => {
    window.localStorage.setItem('k', 'v')
    expect(window.localStorage.getItem('k')).toBe('v')
  })

  it('splits mixed-script reminder text into font runs', () => {
    const runs = splitScriptRuns('DRINK 물 water')
    expect(runs.map((r) => r.script)).toEqual(['latin', 'hangul', 'latin'])
    expect(runs.map((r) => r.text).join('')).toBe('DRINK 물 water')
  })
})
