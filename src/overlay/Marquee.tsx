import { motion, useAnimationFrame, useMotionValue } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMarqueeConfig } from './useMarqueeConfig'
import { getFontClassForScript, splitScriptRuns } from './fontRouting'
import { ledColorAt } from '@/lib/ledSettings'

const GLOW = 0.65
const SEPARATOR = '\u00A0\u00A0•\u00A0\u00A0'

export function Marquee({ emptyMessage }: { emptyMessage?: string }) {
  const { ref: containerRef, speed, habits, overlay, fontSize, containerWidth } = useMarqueeConfig()
  const loopWidthRef = useRef(0)
  const x = useMotionValue(0)
  const copyRef = useRef<HTMLSpanElement | null>(null)
  const [copyWidth, setCopyWidth] = useState(0)
  const segments = useMemo(() => {
    if (habits.length > 0) return habits
    if (emptyMessage) return [{ text: emptyMessage, color: ledColorAt(overlay.color, 0) }]
    return []
  }, [emptyMessage, habits, overlay.color])
  const hasText = segments.length > 0
  const segmentsWithRuns = useMemo(
    () => segments.map((segment) => ({ ...segment, runs: splitScriptRuns(segment.text) })),
    [segments],
  )

  useEffect(() => {
    const el = copyRef.current
    if (!el) return
    const measure = () => {
      const w = el.getBoundingClientRect().width
      if (w) setCopyWidth(w)
    }
    measure()
    const observer = new ResizeObserver(() => measure())
    observer.observe(el)
    return () => observer.disconnect()
  }, [fontSize, segmentsWithRuns])

  useEffect(() => {
    if (!copyWidth) return
    loopWidthRef.current = copyWidth
    x.set(0)
  }, [copyWidth, x])

  useAnimationFrame((_t, delta) => {
    if (overlay.paused) return
    const loopWidth = loopWidthRef.current
    if (!loopWidth) return
    const deltaPx = (speed * delta) / 1000
    let next = x.get() - deltaPx
    if (next <= -loopWidth) {
      next += loopWidth
    }
    x.set(next)
  })

  const copies = useMemo(() => {
    if (!copyWidth || !hasText) return 2
    return Math.max(2, Math.ceil((containerWidth || 0) / copyWidth) + 1)
  }, [copyWidth, containerWidth, hasText])

  return (
    <div ref={containerRef} className="led-panel relative flex h-full items-center overflow-hidden px-8" style={{ borderRadius: 8 }}>
      <div className="absolute inset-0 burnin opacity-70" />
      {hasText && (
        <motion.div className="led-font-dot flex items-center whitespace-nowrap font-normal tracking-[0.3em]" style={{ x, fontSize }}>
          {Array.from({ length: copies }).map((_, idx) => (
            <span key={idx} ref={idx === 0 ? copyRef : null} className="inline-flex items-center">
              {segmentsWithRuns.map((segment, segIdx) => (
                <span key={`${idx}-${segIdx}`} className="inline-flex items-center">
                  <span
                    className="inline-block"
                    style={{ color: segment.color, textShadow: `0 0 ${18 * GLOW}px ${segment.color}` }}
                  >
                    {segment.runs.map((run, runIdx) => (
                      <span key={`${idx}-${segIdx}-${runIdx}`} className={`inline-block ${getFontClassForScript(run.script)}`}>
                        {run.text}
                      </span>
                    ))}
                  </span>
                  <span
                    className="inline-block"
                    style={{ color: 'hsl(var(--destructive))', textShadow: `0 0 ${12 * GLOW}px hsl(var(--destructive) / 0.6)` }}
                  >
                    {SEPARATOR}
                  </span>
                </span>
              ))}
            </span>
          ))}
        </motion.div>
      )}
    </div>
  )
}
