import { useState } from 'react'
import { Button } from './Button'
import { useHabitsStore } from '@/stores/useHabitsStore'

export function HabitForm() {
  const addHabit = useHabitsStore((s) => s.addHabit)
  const theme = useHabitsStore((s) => s.theme)
  const [text, setText] = useState('')
  const [speed, setSpeed] = useState(40)

  const handleAdd = async () => {
    if (!text.trim()) return
    await addHabit(text.trim(), { speed })
    setText('')
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white">New Habit</p>
          <span className="text-xs text-white/50">140 chars max</span>
        </div>
        <input
          value={text}
          maxLength={140}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-glow-blue"
          placeholder="Drink water, shoulders back, deep work..."
        />
        <label className="flex items-center gap-3 text-xs text-white/70">
          Speed
          <input
            type="range"
            min={10}
            max={120}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-full"
          />
          <span className="w-12 text-right text-white/60">{speed.toFixed(0)}px/s</span>
        </label>
        <Button onClick={handleAdd} disabled={!text.trim()} className="self-start">
          Add to scroll
        </Button>
        <div className="text-xs text-white/50">Color: <span style={{ color: theme.primary }}>{theme.primary}</span></div>
      </div>
    </div>
  )
}
