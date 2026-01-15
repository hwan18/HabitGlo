import { motion, useAnimationControls } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { useMarqueeConfig } from './useMarqueeConfig'

const useMeasureWidth = () => {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}

export function Marquee() {
  const { ref: containerRef, gap, speed, habits, overlay, theme } = useMarqueeConfig()
  const { ref: contentRef, width: contentWidth } = useMeasureWidth()
  const controls = useAnimationControls()

  useEffect(() => {
    if (!contentWidth) return
    const pxPerSec = Math.max(1, speed / 2)
    const loopWidth = contentWidth + gap
    const nextDuration = loopWidth / pxPerSec
    if (!overlay.paused) {
      controls.start({
        x: [0, -loopWidth],
        transition: { duration: nextDuration, ease: 'linear', repeat: Infinity },
      })
    }
  }, [contentWidth, gap, speed, controls, overlay.paused])

  useEffect(() => {
    if (overlay.paused) {
      controls.stop()
    }
  }, [overlay.paused, controls])

  const text = habits.join(' • ') || 'Add your first habit'

  return (
    <div
      ref={containerRef}
      className="relative flex h-full items-center overflow-hidden bg-black/60 backdrop-blur-xl"
      style={{ opacity: theme.opacity, borderRadius: 8 }}
    >
      <div className="absolute inset-0 burnin opacity-70" />
      <motion.div
        ref={contentRef}
        className={clsx(
          'flex items-center whitespace-nowrap px-8 text-4xl font-semibold tracking-[0.3em]',
          'drop-shadow-[0_0_12px_rgba(255,99,132,0.55)]',
        )}
        animate={controls}
        style={{
          color: theme.primary,
          textShadow: `0 0 ${18 * theme.glow}px ${theme.primary}, 0 0 ${16 * theme.glow}px ${theme.secondary}`,
        }}
      >
        {text}
        <span style={{ paddingLeft: gap }} />
        {text}
      </motion.div>
    </div>
  )
}
