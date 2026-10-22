import { motion, useAnimationFrame, useMotionValue } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { useMarqueeConfig } from './useMarqueeConfig'
import { getFontClassForScript, getLedLatinFontClass, splitScriptRuns } from './fontRouting'
import { ledColorAt } from '@/lib/ledSettings'

export function Marquee({ emptyMessage }: { emptyMessage?: string }) {
  const { ref: containerRef, gap, spacing, speed, habits, overlay, theme, fontSize, containerWidth } = useMarqueeConfig()
  const loopWidthRef = useRef(0)
  const x = useMotionValue(0)
  const copyRef = useRef<HTMLSpanElement | null>(null)
  const [copyWidth, setCopyWidth] = useState(0)
  const showSeparator = theme.showSeparator ?? true
  const separator = showSeparator ? '\u00A0\u00A0•\u00A0\u00A0' : '\u00A0\u00A0\u00A0\u00A0'
  const separatorColor = 'hsl(var(--destructive))'
  const separatorGlow = 'hsl(var(--destructive) / 0.6)'
  const segments = useMemo(() => {
    if (habits.length > 0) return habits
    if (emptyMessage) return [{ text: emptyMessage, color: ledColorAt(overlay.color, 0) }]
    return []
  }, [emptyMessage, habits, overlay.color])
  const hasText = segments.length > 0
  const ledFontClass = getLedLatinFontClass(theme.ledFont)
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
  }, [fontSize, segmentsWithRuns, separator, spacing, theme.ledFont])

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
    const deltaPx = (speed * delta) / 1000
    let next = x.get() - deltaPx
    if (next <= -loopWidth) {
      next += loopWidth
    }
    x.set(next)
  })

  const copies = useMemo(() => {
    if (!copyWidth || !hasText) return 2
    const minWidth = containerWidth || 0
    return Math.max(2, Math.ceil(minWidth / (copyWidth + gap)) + 1)
  }, [copyWidth, containerWidth, gap, hasText])

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
      {hasText && (
        <motion.div
          className={clsx(`${ledFontClass} flex items-center whitespace-nowrap font-normal tracking-[0.3em]`)}
          style={{
            x,
            fontSize,
          }}
        >
          {Array.from({ length: copies }).map((_, idx) => (
            <span
              key={idx}
              ref={idx === 0 ? copyRef : null}
              className="inline-flex items-center"
              style={idx < copies - 1 ? { marginRight: gap } : undefined}
            >
              {segmentsWithRuns.map((segment, segIdx) => (
                <span key={`${idx}-${segIdx}`} className="inline-flex items-center">
                  <span
                    className="inline-block"
                    style={{
                      color: segment.color,
                      textShadow: `0 0 ${18 * theme.glow}px ${segment.color}`,
                    }}
                  >
                    {segment.runs.map((run, runIdx) => (
                      <span
                        key={`${idx}-${segIdx}-${runIdx}`}
                        className={clsx('inline-block', getFontClassForScript(run.script, ledFontClass))}
                      >
                        {run.text}
                      </span>
                    ))}
                  </span>
                  <span
                    className="inline-block"
                    style={{
                      color: showSeparator ? separatorColor : 'transparent',
                      textShadow: showSeparator ? `0 0 ${12 * theme.glow}px ${separatorGlow}` : 'none',
                      marginLeft: spacing > 0 ? spacing / 2 : undefined,
                      marginRight: spacing > 0 ? spacing / 2 : undefined,
                    }}
                  >
                    {separator}
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
