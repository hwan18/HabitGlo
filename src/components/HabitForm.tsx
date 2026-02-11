import { useState } from 'react'
import { Button } from './Button'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { Plus } from 'lucide-react'

export function HabitForm() {
  const addHabit = useHabitsStore((s) => s.addHabit)
  const [habits, setHabits] = useState<string[]>([''])

  const addTextBox = () => {
    setHabits([...habits, ''])
  }

  const updateHabit = (index: number, value: string) => {
    const updated = [...habits]
    updated[index] = value.slice(0, 220)
    setHabits(updated)
  }

  const addSingleHabit = async (index: number) => {
    const text = habits[index]?.trim()
    if (!text) return
    await addHabit(text)
    const updated = [...habits]
    updated[index] = ''
    setHabits(updated)
  }

  const handleAddAll = async () => {
    const validHabits = habits.filter((h) => h.trim())
    if (validHabits.length === 0) return

    for (const text of validHabits) {
      await addHabit(text.trim())
    }
    setHabits([''])
  }

  const removeTextBox = (index: number) => {
    if (habits.length === 1) return
    setHabits(habits.filter((_, i) => i !== index))
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Add habits and reminders</p>
          <span className="text-xs text-white/50">220 chars max each</span>
        </div>
        <div className="flex flex-col gap-2">
          {habits.map((habit, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={habit}
                maxLength={220}
                onChange={(e) => updateHabit(index, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void addSingleHabit(index)
                  }
                  if (e.key === 'Backspace' && habit === '' && habits.length > 1) {
                    removeTextBox(index)
                  }
                }}
                className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-glow-blue placeholder:text-white/40"
                placeholder={`Habit ${index + 1}...`}
                type="text"
              />
              {habits.length > 1 && (
                <button
                  onClick={() => removeTextBox(index)}
                  className="rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-xs text-white/60 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40 transition-colors"
                  title="Remove"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={addTextBox}
            className="flex items-center gap-1 text-xs"
          >
            <Plus size={14} />
            Add Habit/Reminder
          </Button>
          <Button onClick={handleAddAll} disabled={habits.every((h) => !h.trim())} className="flex-1">
            Add All Habits
          </Button>
        </div>
      </div>
    </div>
  )
}
