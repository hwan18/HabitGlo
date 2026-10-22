import { useEffect, useState } from 'react'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { onMainVisibilityChange, onOverlayVisibilityChange } from './overlayWindow'

const usePageVisible = () => {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return visible
}

/**
 * Whether an LED strip should animate: not paused, its page visible, and its window shown.
 * When this is false the animation is paused, so a hidden or paused strip costs no CPU.
 */
export const useLedRunning = (windowKind: 'overlay' | 'main') => {
  const paused = useHabitsStore((s) => s.overlay.paused)
  const pageVisible = usePageVisible()
  const [windowShown, setWindowShown] = useState(true)

  useEffect(
    () => (windowKind === 'overlay' ? onOverlayVisibilityChange(setWindowShown) : onMainVisibilityChange(setWindowShown)),
    [windowKind],
  )

  return !paused && pageVisible && windowShown
}
