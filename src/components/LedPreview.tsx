import { useEffect, useState } from 'react'
import { Eye, EyeOff, Pause, Play } from 'lucide-react'
import { Marquee } from '@/overlay/Marquee'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { isTauri } from '@/lib/platform'
import { isOverlayVisible, onOverlayVisibilityChange, setOverlayVisible } from '@/lib/overlayWindow'

function useOverlayVisibility() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (!isTauri) return
    let active = true
    void isOverlayVisible().then((isVisible) => {
      if (active) setVisible(isVisible)
    })
    const unsubscribe = onOverlayVisibilityChange((isVisible) => setVisible(isVisible))
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return visible
}

export function LedPreview() {
  const paused = useHabitsStore((s) => s.overlay.paused)
  const setOverlay = useHabitsStore((s) => s.setOverlay)
  const hasActive = useHabitsStore((s) => s.habits.some((h) => h.is_active && h.text))
  const visible = useOverlayVisibility()
  const [updating, setUpdating] = useState(false)

  const toggleVisibility = async () => {
    setUpdating(true)
    try {
      await setOverlayVisible(!(await isOverlayVisible()))
    } finally {
      setUpdating(false)
    }
  }

  return (
    <section aria-label="LED preview" className="rounded-xl border border-app-border bg-app-card p-3">
      <div className="relative h-20 overflow-hidden rounded-lg bg-black">
        <Marquee />
        {!hasActive && (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-app-muted">
            Your reminders will scroll here.
          </p>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setOverlay({ paused: !paused })}
          aria-pressed={!paused}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-app-accent text-base font-semibold text-app-accent-text transition-colors hover:bg-[#ffc23d]"
        >
          {paused ? <Play size={20} aria-hidden /> : <Pause size={20} aria-hidden />}
          {paused ? 'Start' : 'Pause'}
        </button>
        <button
          type="button"
          onClick={() => void toggleVisibility()}
          disabled={!isTauri || updating}
          title={isTauri ? undefined : 'The LED strip on your desktop needs the HabitGlo app'}
          className="flex h-12 items-center justify-center gap-2 rounded-lg border border-app-border bg-app-raised px-4 text-sm font-medium text-app-text transition-colors hover:border-app-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
          {visible ? 'Hide LED' : 'Show LED'}
        </button>
      </div>
    </section>
  )
}
