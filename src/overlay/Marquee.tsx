import { useEffect, useMemo, useRef, useState } from 'react'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { ledColorAt, SPEED_PX_PER_SEC } from '@/lib/ledSettings'
import { getFontClassForScript, splitScriptRuns } from './fontRouting'

const SEPARATOR = '\u00A0\u00A0•\u00A0\u00A0'
const DEFAULT_HEIGHT = 80

type Props = {
  /** Scrolls when there is nothing active to show; without it the strip stays empty. */
  emptyMessage?: string
  /** False pauses the animation completely (paused, hidden window, minimized page). */
  running: boolean
}

/** Element size, updated only when it actually changes. */
const useSize = (el: Element | null) => {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const box = entry.borderBoxSize?.[0]
      const width = box ? box.inlineSize : entry.contentRect.width
      const height = box ? box.blockSize : entry.contentRect.height
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])
  return size
}

/**
 * The scrolling LED text. One copy of all reminders is repeated enough times to fill the strip and
 * a single compositor animation slides the row left by exactly one copy, looping seamlessly.
 * No JavaScript runs per frame; layout is recomputed only when text, speed or size change.
 */
export function Marquee({ emptyMessage, running }: Props) {
  const habits = useHabitsStore((s) => s.habits)
  const colorPreset = useHabitsStore((s) => s.overlay.color)
  const speed = SPEED_PX_PER_SEC[useHabitsStore((s) => s.overlay.speed)] ?? SPEED_PX_PER_SEC.medium

  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [track, setTrack] = useState<HTMLDivElement | null>(null)
  const [firstCopy, setFirstCopy] = useState<HTMLSpanElement | null>(null)
  const containerSize = useSize(container)
  const copyWidth = useSize(firstCopy).width

  const segments = useMemo(() => {
    const active = habits
      .filter((h) => h.is_active && h.text)
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
      .map((h, index) => ({ key: h.id, text: h.text, color: ledColorAt(colorPreset, index) }))
    if (active.length > 0 || !emptyMessage) return active
    return [{ key: 'empty', text: emptyMessage, color: ledColorAt(colorPreset, 0) }]
  }, [habits, colorPreset, emptyMessage])

  const copyContent = useMemo(
    () =>
      segments.map((segment) => (
        <span key={segment.key} className="inline-flex items-center">
          <span style={{ color: segment.color, textShadow: `0 0 12px ${segment.color}` }}>
            {splitScriptRuns(segment.text).map((run, i) => (
              <span key={i} className={getFontClassForScript(run.script)}>
                {run.text}
              </span>
            ))}
          </span>
          <span className="text-white/35">{SEPARATOR}</span>
        </span>
      )),
    [segments],
  )

  const height = containerSize.height || DEFAULT_HEIGHT
  const fontSize = Math.max(14, Math.min(64, Math.floor(height * 0.6)))
  const copies = copyWidth > 0 ? Math.max(2, Math.ceil(containerSize.width / copyWidth) + 1) : 2

  const animationRef = useRef<Animation | null>(null)
  const geometryRef = useRef<{ track: HTMLElement; loop: number; duration: number } | null>(null)
  const runningRef = useRef(running)

  useEffect(() => {
    runningRef.current = running
    const animation = animationRef.current
    if (!animation) return
    if (running) animation.play()
    else animation.pause()
  }, [running])

  useEffect(() => {
    const previous = animationRef.current
    const previousGeometry = geometryRef.current
    if (!track || copyWidth <= 0 || typeof track.animate !== 'function') {
      previous?.cancel()
      animationRef.current = null
      geometryRef.current = null
      return
    }
    const loop = copyWidth
    const duration = (loop / speed) * 1000
    // Keep the text where it is when the content or speed changes, instead of jumping back to the start.
    let offsetPx = 0
    if (previous && previousGeometry?.track === track) {
      const time = Number(previous.currentTime ?? 0)
      offsetPx = ((time % previousGeometry.duration) / previousGeometry.duration) * previousGeometry.loop
    }
    previous?.cancel()
    const animation = track.animate(
      [{ transform: 'translate3d(0, 0, 0)' }, { transform: `translate3d(${-loop}px, 0, 0)` }],
      { duration, iterations: Infinity, easing: 'linear' },
    )
    animation.currentTime = ((offsetPx % loop) / loop) * duration
    if (!runningRef.current) animation.pause()
    animationRef.current = animation
    geometryRef.current = { track, loop, duration }
  }, [track, copyWidth, speed])

  useEffect(
    () => () => {
      animationRef.current?.cancel()
      animationRef.current = null
    },
    [],
  )

  return (
    <div ref={setContainer} aria-hidden className="led-panel relative flex h-full items-center overflow-hidden rounded-lg">
      {segments.length > 0 && (
        <div
          ref={setTrack}
          className="flex w-max shrink-0 items-center whitespace-nowrap tracking-[0.3em] will-change-transform"
          style={{ fontSize }}
        >
          {Array.from({ length: copies }, (_, i) => (
            <span key={i} ref={i === 0 ? setFirstCopy : undefined} className="inline-flex shrink-0 items-center">
              {copyContent}
            </span>
          ))}
        </div>
      )}
      <div className="led-grid pointer-events-none absolute inset-0" />
    </div>
  )
}
