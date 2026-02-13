import type { LedFont } from '@/types'

export type ScriptGroup = 'latin' | 'hangul' | 'japanese' | 'han' | 'cyrillic' | 'greek' | 'other' | 'common'
export type ScriptRunGroup = Exclude<ScriptGroup, 'common'>

export type ScriptRun = {
  text: string
  script: ScriptRunGroup
}

const commonCharRe = /[\s0-9!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~•·]/

export const detectScriptGroup = (char: string, hasKana: boolean): ScriptGroup => {
  const code = char.codePointAt(0) ?? 0
  if (commonCharRe.test(char)) return 'common'
  if ((code >= 0x1100 && code <= 0x11ff) || (code >= 0x3130 && code <= 0x318f) || (code >= 0xac00 && code <= 0xd7a3)) {
    return 'hangul'
  }
  if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x31f0 && code <= 0x31ff)) {
    return 'japanese'
  }
  if ((code >= 0x3400 && code <= 0x4dbf) || (code >= 0x4e00 && code <= 0x9fff)) {
    return hasKana ? 'japanese' : 'han'
  }
  if ((code >= 0x0370 && code <= 0x03ff) || (code >= 0x1f00 && code <= 0x1fff)) {
    return 'greek'
  }
  if ((code >= 0x0400 && code <= 0x052f) || (code >= 0x2de0 && code <= 0x2dff) || (code >= 0xa640 && code <= 0xa69f)) {
    return 'cyrillic'
  }
  if (
    (code >= 0x0041 && code <= 0x007a) ||
    (code >= 0x00c0 && code <= 0x024f) ||
    (code >= 0x1e00 && code <= 0x1eff)
  ) {
    return 'latin'
  }
  return 'other'
}

export const splitScriptRuns = (text: string): ScriptRun[] => {
  const hasKana = /[\u3040-\u30ff\u31f0-\u31ff]/u.test(text)
  const chars = Array.from(text)
  const runs: ScriptRun[] = []
  let currentScript: ScriptRunGroup = 'latin'
  let buffer = ''

  for (const char of chars) {
    const detected = detectScriptGroup(char, hasKana)
    const script: ScriptRunGroup = detected === 'common' ? currentScript : detected
    if (script !== currentScript && buffer) {
      runs.push({ text: buffer, script: currentScript })
      buffer = ''
    }
    currentScript = script
    buffer += char
  }

  if (buffer) {
    runs.push({ text: buffer, script: currentScript })
  }

  return runs
}

export const getLedLatinFontClass = (ledFont: LedFont): string => {
  if (ledFont === 'silkscreen') return 'led-font-silk'
  if (ledFont === 'pressStart') return 'led-font-press'
  if (ledFont === 'vt323') return 'led-font-vt323'
  return 'led-font-dot'
}

export const getFontClassForScript = (script: ScriptRunGroup, selectedLatinClass: string): string => {
  if (script === 'latin') return selectedLatinClass
  if (script === 'hangul') return 'led-font-ko'
  if (script === 'japanese') return 'led-font-ja'
  if (script === 'han') return 'led-font-zh'
  if (script === 'cyrillic' || script === 'greek') return 'led-font-cygr'
  return 'led-font-fallback'
}
