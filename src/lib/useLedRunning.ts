import { useEffect, useState } from 'react'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { onMainVisibilityChange, onOverlayVisibilityChange, onWindowFocusChange } from './overlayWindow'
import { isTauri } from './platform'

const usePageVisible = () => {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return visible
}

const usePageFocused = () => {
  const [focused, setFocused] = useState(() => typeof document === 'undefined' || document.hasFocus())
  useEffect(() => {
    const update = () => setFocused(document.hasFocus())
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)
    return () => {
      window.removeEventListener('focus', update)
      window.removeEventListener('blur', update)
    }
  }, [])
  return focused
}

/**
 * Whether an LED strip should animate: not paused, its page visible, and its window shown.
 * The preview in the main window also needs the window focused: it usually sits open behind other apps all day,
 * and the real strip already shows the same thing. When this is false the animation is paused and costs no CPU.
 */
export const useLedRunning = (windowKind: 'overlay' | 'main') => {
  const paused = useHabitsStore((s) => s.overlay.paused)
  const pageVisible = usePageVisible()
  const pageFocused = usePageFocused()
  const [windowShown, setWindowShown] = useState(true)
  const [windowFocused, setWindowFocused] = useState(true)

  useEffect(
    () => (windowKind === 'overlay' ? onOverlayVisibilityChange(setWindowShown) : onMainVisibilityChange(setWindowShown)),
    [windowKind],
  )
  useEffect(() => (windowKind === 'main' ? onWindowFocusChange(setWindowFocused) : undefined), [windowKind])

  const focused = isTauri ? windowFocused : pageFocused
  return !paused && pageVisible && windowShown && (windowKind === 'overlay' || focused)
}
