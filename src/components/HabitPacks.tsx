import { useState } from 'react'
import { Package } from 'lucide-react'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { habitPacks, type HabitPack } from '@/data/habitPacks'

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
        {habitPacks.map((pack) => (
          <button
            key={pack.id}
            onClick={() => applyPack(pack)}
            disabled={applying === pack.id}
            title={pack.description}
            className="rounded-lg border border-white/10 bg-black/40 p-2 text-left text-xs text-white/70 transition-colors hover:border-glow-blue disabled:opacity-50"
          >
            <div className="font-semibold text-[11px] text-white">
              {applying === pack.id
                ? 'Applying…'
                : applied === pack.id
                ? 'Applied!'
                : pack.title}
            </div>
            <div className="mt-1 text-[10px] text-white/40">
              {pack.habits.length} habits
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
