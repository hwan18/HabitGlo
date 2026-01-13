import { useMemo } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, GripVertical, Pause, Play, Trash } from 'lucide-react'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { Button } from './Button'
import type { Habit } from '@/types'

const HabitCard = ({ habit }: { habit: Habit }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: habit.id })
  const toggleHabit = useHabitsStore((s) => s.toggleHabit)
  const removeHabit = useHabitsStore((s) => s.removeHabit)
  const markDone = useHabitsStore((s) => s.markDone)
  const theme = useHabitsStore((s) => s.theme)

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className="flex items-center justify-between rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white/80 shadow-inner shadow-black/60"
    >
      <div className="flex items-center gap-2">
        <button
          className="cursor-grab rounded border border-white/5 bg-white/5 p-1 text-white/60"
          {...attributes}
          {...listeners}
          title="Drag to reorder"
        >
          <GripVertical size={14} />
        </button>
        <span className="font-medium text-white">{habit.text}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-white/60">#{habit.priority + 1}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => markDone(habit.id)}
          title="Mark as done"
          className="flex items-center gap-1"
        >
          <Check size={12} />
          Log
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => toggleHabit(habit.id, !habit.is_active)}
          className="flex items-center gap-1"
        >
          {habit.is_active ? <Pause size={12} /> : <Play size={12} />}
          {habit.is_active ? 'Pause' : 'Resume'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => removeHabit(habit.id)}
          className="flex items-center gap-1 text-red-300 hover:border-red-500/60"
        >
          <Trash size={12} />
          Delete
        </Button>
        <span
          className="h-6 w-6 rounded-full border border-white/10"
          style={{ backgroundColor: habit.color ?? theme.primary }}
          title="Color"
        />
      </div>
    </div>
  )
}

export function HabitList() {
  const rawHabits = useHabitsStore((s) => s.habits)
  const reorder = useHabitsStore((s) => s.reorder)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const habits = useMemo(() => [...rawHabits].sort((a, b) => a.priority - b.priority), [rawHabits])

  const onDragEnd = async (event: any) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = habits.findIndex((h) => h.id === active.id)
    const newIndex = habits.findIndex((h) => h.id === over.id)
    const sorted = arrayMove(habits, oldIndex, newIndex)
    await reorder(sorted.map((h) => h.id))
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Active cycle</p>
        <span className="text-xs text-white/50">{habits.length} habits</span>
      </div>
      {habits.length === 0 ? (
        <p className="text-sm text-white/60">Add a habit to start the scroll.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={habits.map((h) => h.id)} strategy={horizontalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {habits.map((habit) => (
                <HabitCard key={habit.id} habit={habit} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
