import { motion, useAnimationFrame, useMotionValue } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { useMarqueeConfig } from './useMarqueeConfig'

export function Marquee() {
  const { ref: containerRef, gap, speed, habits, overlay, theme, fontSize, containerWidth } = useMarqueeConfig()
  const loopWidthRef = useRef(0)
  const x = useMotionValue(0)
  const copyRef = useRef<HTMLSpanElement | null>(null)
  const [copyWidth, setCopyWidth] = useState(0)

  useEffect(() => {
    if (!copyRef.current) return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setCopyWidth(w)
    })
    observer.observe(copyRef.current)
    return () => observer.disconnect()
  }, [habits.length])

  useEffect(() => {
    if (!copyWidth) return
    const loopWidth = copyWidth + gap
    loopWidthRef.current = loopWidth
    x.set(0)
  }, [copyWidth, gap, x])

  useAnimationFrame((_t, delta) => {
    if (overlay.paused) return
    const loopWidth = loopWidthRef.current
    if (!loopWidth) return
    const pxPerSec = Math.max(1, speed / 2)
    const deltaPx = (pxPerSec * delta) / 1000
    let next = x.get() - deltaPx
    if (next <= -loopWidth) {
      next += loopWidth
    }
    x.set(next)
  })

  const separator = '\u00A0\u00A0•\u00A0\u00A0'
  const text = habits.length > 0 ? habits.join(separator) + separator : ''
  const copies = useMemo(() => {
    if (!copyWidth || habits.length === 0) return 2
    const minWidth = containerWidth || 0
    return Math.max(2, Math.ceil(minWidth / (copyWidth + gap)) + 1)
  }, [copyWidth, containerWidth, gap, habits.length])

  return (
    <div
      ref={containerRef}
      className="led-panel relative flex h-full items-center overflow-hidden px-8"
      style={{
        opacity: theme.opacity,
        borderRadius: 8,
      }}
    >
      <div className="absolute inset-0 burnin opacity-70" />
      {habits.length > 0 && (
        <motion.div
          className={clsx(
            'led-font flex items-center whitespace-nowrap font-normal tracking-[0.3em]',
            'drop-shadow-[0_0_12px_rgba(255,99,132,0.55)]',
          )}
          style={{
            x,
            color: theme.primary,
            textShadow: `0 0 ${18 * theme.glow}px ${theme.primary}, 0 0 ${16 * theme.glow}px ${theme.secondary}`,
            fontSize,
          }}
        >
          {Array.from({ length: copies }).map((_, idx) => (
            <span
              key={idx}
              ref={idx === 0 ? copyRef : null}
              style={idx < copies - 1 ? { marginRight: gap } : undefined}
            >
              {text}
            </span>
          ))}
        </motion.div>
      )}
    </div>
  )
}
