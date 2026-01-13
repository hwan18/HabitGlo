import { useEffect, useMemo, useRef, useState } from 'react'
import { useHabitsStore } from '@/stores/useHabitsStore'

export const useMarqueeConfig = () => {
  const overlay = useHabitsStore((s) => s.overlay)
  const theme = useHabitsStore((s) => s.theme)
  const setOverlay = useHabitsStore((s) => s.setOverlay)
  const habitsRaw = useHabitsStore((s) => s.habits)
  const [containerWidth, setContainerWidth] = useState(1200)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setContainerWidth(width)
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  const gap = useMemo(() => Math.max(overlay.gap, containerWidth * 0.2), [overlay.gap, containerWidth])
  const speed = overlay.speed

  const marqueeText = useMemo(() => {
    const active = habitsRaw.filter((h) => h.is_active)
    if (active.length === 0) return ['Add your first habit', 'Hydrate now']
    return [...active]
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
      .map((h) => h.text)
      .filter(Boolean)
  }, [habitsRaw])

  return {
    ref,
    gap,
    speed,
    habits: marqueeText,
    overlay,
    theme,
    setOverlay,
  }
}
