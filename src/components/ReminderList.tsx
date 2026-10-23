import { memo, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import { GripVertical, Trash2 } from 'lucide-react'
import { isComposingEnter } from '@/lib/ime'
import { MAX_REMINDER_LENGTH, useHabitsStore } from '@/stores/useHabitsStore'
import type { Habit } from '@/types'

function ReminderText({ habit }: { habit: Habit }) {
  const updateHabitText = useHabitsStore((s) => s.updateHabitText)
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false)

  if (draft === null) {
    return (
      <button
        type="button"
        onClick={() => {
          cancelled.current = false
          setDraft(habit.text)
        }}
        title="Click to edit"
        className={clsx(
          'min-w-0 flex-1 px-1 py-0.5 text-left text-sm leading-snug [overflow-wrap:anywhere] line-clamp-3 hover:text-app-text',
          habit.is_active ? 'text-app-text' : 'text-app-muted line-through decoration-app-muted/60',
        )}
      >
        {habit.text}
      </button>
    )
  }

  const save = () => {
    if (!cancelled.current) void updateHabitText(habit.id, draft)
    setDraft(null)
  }

  return (
    <input
      autoFocus
      aria-label="Edit reminder"
      value={draft}
      maxLength={MAX_REMINDER_LENGTH}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (isComposingEnter(e)) return
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cancelled.current = true
          e.currentTarget.blur()
        }
      }}
      className="chamfer chamfer-field h-8 min-w-0 flex-1 px-2 text-sm"
    />
  )
}

const ReminderRow = memo(function ReminderRow({ habit }: { habit: Habit }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: habit.id,
  })
  const toggleHabit = useHabitsStore((s) => s.toggleHabit)
  const removeHabit = useHabitsStore((s) => s.removeHabit)
  const shortLabel = habit.text.length > 40 ? `${habit.text.slice(0, 40)}…` : habit.text

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        'flex items-center gap-2 border-b border-app-border px-1 py-2',
        isDragging && 'relative z-10 bg-app-card',
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder "${shortLabel}"`}
        className="cursor-grab touch-none rounded p-1 text-app-muted hover:bg-app-raised hover:text-app-text active:cursor-grabbing"
      >
        <GripVertical size={16} aria-hidden />
      </button>
      <ReminderText habit={habit} />
      <button
        type="button"
        role="switch"
        aria-checked={habit.is_active}
        aria-label={`Show "${shortLabel}" on the LED`}
        onClick={() => void toggleHabit(habit.id, !habit.is_active)}
        className={clsx(
          'relative h-6 w-10 shrink-0 rounded-full transition-colors',
          habit.is_active ? 'bg-app-accent' : 'bg-app-border',
        )}
      >
        <span
          aria-hidden
          className={clsx(
            'absolute top-1 h-4 w-4 rounded-full bg-white transition-[left]',
            habit.is_active ? 'left-5' : 'left-1',
          )}
        />
      </button>
      <button
        type="button"
        onClick={() => void removeHabit(habit.id)}
        aria-label={`Delete "${shortLabel}"`}
        title="Delete"
        className="shrink-0 rounded p-1.5 text-app-muted hover:bg-app-raised hover:text-app-danger"
      >
        <Trash2 size={16} aria-hidden />
      </button>
    </li>
  )
})

export function ReminderList() {
  const rawHabits = useHabitsStore((s) => s.habits)
  const reorder = useHabitsStore((s) => s.reorder)
  const habits = useMemo(() => [...rawHabits].sort((a, b) => a.priority - b.priority), [rawHabits])
  const ids = useMemo(() => habits.map((h) => h.id), [habits])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    void reorder(arrayMove(ids, oldIndex, newIndex))
  }

  if (habits.length === 0) {
    return (
      <p className="corner-tick py-6 text-sm text-app-muted">Add something you want to see all day.</p>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul aria-label="Your reminders" className="flex flex-col gap-2">
          {habits.map((habit) => (
            <ReminderRow key={habit.id} habit={habit} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
