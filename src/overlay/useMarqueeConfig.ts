import { useEffect, useMemo, useRef, useState } from 'react'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { ledColorAt, SPEED_PX_PER_SEC } from '@/lib/ledSettings'

export const useMarqueeConfig = () => {
  const overlay = useHabitsStore((s) => s.overlay)
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

  const speed = SPEED_PX_PER_SEC[overlay.speed] ?? SPEED_PX_PER_SEC.medium
  const fontSize = useMemo(() => {
    const size = Math.floor(containerHeight * 0.6)
    return Math.max(14, Math.min(64, size))
  }, [containerHeight])

  const marqueeHabits = useMemo(
    () =>
      habitsRaw
        .filter((h) => h.is_active && Boolean(h.text))
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
        .map((habit, index) => ({ text: habit.text, color: ledColorAt(overlay.color, index) })),
    [habitsRaw, overlay.color],
  )

  return {
    ref,
    speed,
    fontSize,
    habits: marqueeHabits,
    overlay,
    containerWidth,
  }
}
