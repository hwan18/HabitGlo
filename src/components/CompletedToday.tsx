import { useMemo } from 'react'
import { CheckCircle, Flame } from 'lucide-react'
import { useHabitsStore } from '@/stores/useHabitsStore'

const isToday = (dateStr: string): boolean => {
  const d = new Date(dateStr)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

export function CompletedToday() {
  const completedToday = useHabitsStore((s) => s.completedToday)

  const entries = useMemo(
    () => completedToday.filter((e) => isToday(e.loggedAt)),
    [completedToday],
  )

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <CheckCircle size={14} className="text-green-400" />
        <p className="text-sm font-semibold text-white">Completed Today</p>
        <span className="text-xs text-white/50">{entries.length} done</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-white/40">No habits logged yet today. Start logging!</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-lg border border-green-500/10 bg-green-900/10 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <CheckCircle size={12} className="text-green-400" />
                <span className="text-sm text-white">{entry.text}</span>
              </div>
              {entry.streak > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-orange-300">
                  <Flame size={10} />
                  {entry.streak}d
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
