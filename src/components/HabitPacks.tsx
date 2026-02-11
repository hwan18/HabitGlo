import { useState } from 'react'
import { Package, Lock } from 'lucide-react'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { habitPacks, type HabitPack } from '@/data/habitPacks'
import { isTauri } from '@/lib/platform'

/** Pack IDs available in browser preview mode */
const BROWSER_FREE_PACKS = new Set(['biohacker'])

export function HabitPacks() {
  const addHabit = useHabitsStore((s) => s.addHabit)
  const clearAllHabits = useHabitsStore((s) => s.clearAllHabits)
  const [applying, setApplying] = useState<string | null>(null)
  const [applied, setApplied] = useState<string | null>(null)

  const applyPack = async (pack: HabitPack) => {
    setApplying(pack.id)
    await clearAllHabits()
    for (const text of pack.habits) {
      await addHabit(text)
    }
    setApplying(null)
    setApplied(pack.id)
    setTimeout(() => setApplied(null), 2000)
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Package size={14} className="text-white/60" />
        <p className="text-sm font-semibold text-white">Habit Packs</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {habitPacks.map((pack) => {
          const locked = !isTauri && !BROWSER_FREE_PACKS.has(pack.id)

          return (
            <button
              key={pack.id}
              onClick={() => !locked && applyPack(pack)}
              disabled={locked || applying === pack.id}
              title={locked ? 'Available with the desktop app' : pack.description}
              className={`relative rounded-lg border p-2 text-left text-xs transition-colors ${
                locked
                  ? 'cursor-not-allowed border-white/5 bg-black/40'
                  : 'border-white/10 bg-black/40 text-white/70 hover:border-glow-blue disabled:opacity-50'
              }`}
            >
              {/* Blur overlay for locked packs */}
              {locked && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-black/60 backdrop-blur-[2px]">
                  <Lock size={14} className="text-white/40" />
                  <span className="mt-1 text-[9px] text-white/40 text-center leading-tight px-1">
                    Desktop app
                  </span>
                </div>
              )}
              <div className={`font-semibold text-[11px] ${locked ? 'text-white/30' : 'text-white'}`}>
                {applying === pack.id
                  ? 'Applying…'
                  : applied === pack.id
                  ? 'Applied!'
                  : pack.title}
              </div>
              <div className={`mt-1 text-[10px] ${locked ? 'text-white/20' : 'text-white/40'}`}>
                {pack.habits.length} habits
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
