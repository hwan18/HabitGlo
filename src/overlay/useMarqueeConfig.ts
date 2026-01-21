import { useEffect, useMemo, useRef, useState } from 'react'
import { useHabitsStore } from '@/stores/useHabitsStore'

export const useMarqueeConfig = () => {
  const overlay = useHabitsStore((s) => s.overlay)
  const theme = useHabitsStore((s) => s.theme)
  const setOverlay = useHabitsStore((s) => s.setOverlay)
  const habitsRaw = useHabitsStore((s) => s.habits)
  const [containerWidth, setContainerWidth] = useState(1200)
  const [containerHeight, setContainerHeight] = useState(96)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      if (rect.width) setContainerWidth(rect.width)
      if (rect.height) setContainerHeight(rect.height)
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  const gap = useMemo(() => Math.max(0, overlay.gap), [overlay.gap])
  const speed = overlay.speed
  const fontSize = useMemo(() => {
    const size = Math.floor(containerHeight * 0.6)
    return Math.max(14, Math.min(64, size))
  }, [containerHeight])

  const marqueeText = useMemo(() => {
    const active = habitsRaw.filter((h) => h.is_active)
    if (active.length === 0) return []
    return [...active]
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
      .map((h) => h.text)
      .filter(Boolean)
  }, [habitsRaw])

  return {
    ref,
    gap,
    speed,
    fontSize,
    habits: marqueeText,
    overlay,
    theme,
    setOverlay,
    containerWidth,
  }
}
