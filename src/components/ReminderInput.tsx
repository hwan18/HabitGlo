import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { isComposingEnter } from '@/lib/ime'
import { MAX_REMINDER_LENGTH, useHabitsStore } from '@/stores/useHabitsStore'

export function ReminderInput() {
  const addHabit = useHabitsStore((s) => s.addHabit)
  const [text, setText] = useState('')
  const canAdd = text.trim().length > 0

  const add = () => {
    const value = text.trim()
    if (!value) return
    void addHabit(value)
    setText('')
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    add()
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <label htmlFor="new-reminder" className="sr-only">
        Add a reminder
      </label>
      <input
        id="new-reminder"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          if (!isComposingEnter(e)) add()
        }}
        maxLength={MAX_REMINDER_LENGTH}
        placeholder="Add a reminder"
        autoComplete="off"
        enterKeyHint="done"
        className="chamfer chamfer-field h-11 min-w-0 flex-1 px-3 text-base placeholder:text-app-muted"
      />
      <button
        type="submit"
        disabled={!canAdd}
        className="chamfer chamfer-btn flex h-11 items-center gap-1 px-4 text-sm font-medium transition-colors"
      >
        <Plus size={16} aria-hidden />
        Add
      </button>
    </form>
  )
}
