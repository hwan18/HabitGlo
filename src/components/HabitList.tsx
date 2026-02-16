import { useMemo, useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, GripVertical, Pause, Play, Trash, Trash2, Flame } from 'lucide-react'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { Button } from './Button'
import type { Habit } from '@/types'

// Check if habit was logged today (local timezone)
const isLoggedToday = (lastDoneAt: string | null | undefined): boolean => {
  if (!lastDoneAt) return false
  const lastDone = new Date(lastDoneAt)
  const now = new Date()
  return (
    lastDone.getFullYear() === now.getFullYear() &&
    lastDone.getMonth() === now.getMonth() &&
    lastDone.getDate() === now.getDate()
  )
}

// Get milestone badge if applicable
const getMilestoneBadge = (streak: number): string | null => {
  if (streak >= 36500) return '🧬' // 100 years
  if (streak >= 18250) return '👑' // 50 years
  if (streak >= 14600) return '🏛️' // 40 years
  if (streak >= 10950) return '🏔️' // 30 years
  if (streak >= 7300) return '🌍' // 20 years
  if (streak >= 5000) return '🔱' // 5000 days
  if (streak >= 3650) return '💎' // 10 years
  if (streak >= 1825) return '🏅' // 5 years
  if (streak >= 1460) return '🎖️' // 4 years
  if (streak >= 1000) return '🏆' // 1000 days
  if (streak >= 730) return '🦁' // 2 years
  if (streak >= 500) return '🚀' // 500 days
  if (streak >= 400) return '🛡️' // 400 days
  if (streak >= 365) return '🎉' // 1 year
  if (streak >= 300) return '🌟' // 300 days
  if (streak >= 270) return '🍂' // 9 months
  if (streak >= 240) return '🍁' // 8 months
  if (streak >= 200) return '⚡' // 200 days
  if (streak >= 180) return '🔥' // half-year
  if (streak >= 150) return '🔆' // 5 months
  if (streak >= 120) return '🌤️' // 4 months
  if (streak >= 100) return '💯' // 100 days
  if (streak >= 90) return '🌙' // 3 months
  if (streak >= 75) return '🥈' // 75 days
  if (streak >= 60) return '🧭' // 2 months
  if (streak >= 50) return '🏅' // 50 days
  if (streak >= 45) return '🎯' // 6 weeks
  if (streak >= 30) return '⭐' // 1 month
  if (streak >= 21) return '🧠' // habit forming
  if (streak >= 14) return '💪' // 2 weeks
  if (streak >= 10) return '🔟' // double digits
  if (streak >= 7) return '✨' // 1 week
  if (streak >= 3) return '🌱' // spark
  if (streak >= 1) return '🟢' // first step
  return null
}

const getStreakTooltip = (streak: number): string =>
  streak === 1 ? 'Current streak: 1 consecutive day' : `Current streak: ${streak} consecutive days`

const HabitCard = ({ habit }: { habit: Habit }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: habit.id })
  const toggleHabit = useHabitsStore((s) => s.toggleHabit)
  const removeHabit = useHabitsStore((s) => s.removeHabit)
  const markDone = useHabitsStore((s) => s.markDone)
  const setHabitColor = useHabitsStore((s) => s.setHabitColor)
  const theme = useHabitsStore((s) => s.theme)
  const paletteColors = [theme.primary, theme.secondary, theme.accent]
  const normalizedColor = habit.color?.toLowerCase()
  const inferredIndex =
    habit.colorIndex ?? paletteColors.findIndex((color) => color.toLowerCase() === normalizedColor)
  const colorIndex = inferredIndex >= 0 ? inferredIndex : 0
  const displayColor = paletteColors[colorIndex] ?? theme.primary

  const [showSuccess, setShowSuccess] = useState(false)
  const loggedToday = isLoggedToday(habit.last_done_at)
  const streak = habit.streak_current ?? 0
  const milestoneBadge = getMilestoneBadge(streak)
  const streakTooltip = getStreakTooltip(streak)

  const handleLog = async () => {
    if (loggedToday) return
    await markDone(habit.id)
    // Show success animation
    setShowSuccess(true)
    setTimeout(() => setShowSuccess(false), 1500)
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm text-white/80 shadow-inner shadow-black/60 transition-all duration-300 ${
        showSuccess
          ? 'border-green-500/50 bg-green-900/30'
          : loggedToday
          ? 'border-green-500/20 bg-black/40'
          : 'border-white/10 bg-black/50'
      }`}
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
        {/* Streak display */}
        {streak > 0 && (
          <div className="group relative">
            <span
              className="flex items-center gap-1 rounded-full bg-orange-500/20 px-2 py-0.5 text-[11px] text-orange-300"
              title={streakTooltip}
              aria-label={streakTooltip}
            >
              <Flame size={10} className="text-orange-400" />
              {streak}
              {milestoneBadge && <span className="ml-0.5">{milestoneBadge}</span>}
            </span>
            <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded border border-white/10 bg-black/90 px-2 py-1 text-[10px] text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {streakTooltip}
            </div>
          </div>
        )}
        {/* Success feedback */}
        {showSuccess && (
          <span className="animate-pulse rounded-full bg-green-500/30 px-2 py-0.5 text-[11px] text-green-300">
            +1 day
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-white/60">#{habit.priority + 1}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleLog}
          disabled={loggedToday}
          title={loggedToday ? 'Already logged today' : 'Mark as done'}
          className={`flex items-center gap-1 ${loggedToday ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          <Check size={12} />
          {loggedToday ? 'Done' : 'Log'}
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
        <button
          type="button"
          className="h-6 w-6 rounded-full border border-white/10"
          style={{ backgroundColor: displayColor }}
          title="Cycle color"
          aria-label="Cycle habit color"
          onClick={() => {
            const nextIndex = (colorIndex + 1) % 3
            void setHabitColor(habit.id, nextIndex)
          }}
        />
      </div>
    </div>
  )
}

export function HabitList() {
  const rawHabits = useHabitsStore((s) => s.habits)
  const reorder = useHabitsStore((s) => s.reorder)
  const clearAllHabits = useHabitsStore((s) => s.clearAllHabits)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const habits = useMemo(() => [...rawHabits].sort((a, b) => a.priority - b.priority), [rawHabits])

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = habits.findIndex((h) => h.id === active.id)
    const newIndex = habits.findIndex((h) => h.id === over.id)
    const sorted = arrayMove(habits, oldIndex, newIndex)
    void reorder(sorted.map((h) => h.id))
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-white">Active cycle</p>
          <span className="text-xs text-white/50">{habits.length} habits</span>
        </div>
        {habits.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => clearAllHabits()}
            className="flex items-center gap-1 text-red-300 hover:border-red-500/60"
          >
            <Trash2 size={12} />
            Delete All
          </Button>
        )}
      </div>
      {habits.length === 0 ? (
        <p className="text-sm text-white/60">Add a habit to start the scroll.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={habits.map((h) => h.id)} strategy={verticalListSortingStrategy}>
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
