import { useEffect, useRef, type ReactNode } from 'react'
import clsx from 'clsx'
import { X } from 'lucide-react'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { COLOR_PRESETS, SPEED_OPTIONS } from '@/lib/ledSettings'
import { isTauri } from '@/lib/platform'
import { AuthPanel } from './AuthPanel'

type Option<T extends string> = { id: T; label: ReactNode; ariaLabel?: string }

function Segmented<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  disabled,
  columns,
}: {
  name: string
  legend: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
  columns: number
}) {
  return (
    <fieldset disabled={disabled} className="disabled:opacity-50">
      <legend className="mb-2 text-sm font-medium text-app-text">{legend}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {options.map((option) => (
          <label key={option.id} className={disabled ? 'cursor-not-allowed' : 'cursor-pointer'}>
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              disabled={disabled}
              onChange={() => onChange(option.id)}
              aria-label={option.ariaLabel}
              className="peer sr-only"
            />
            <span
              className={clsx(
                'flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-2 text-sm transition-colors',
                'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-app-accent',
                value === option.id
                  ? 'border-app-accent bg-app-accent/15 text-app-text'
                  : 'border-app-border bg-app-raised text-app-muted hover:text-app-text',
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement | null>(null)
  const overlay = useHabitsStore((s) => s.overlay)
  const setOverlay = useHabitsStore((s) => s.setOverlay)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby="settings-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="m-auto max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-md overflow-y-auto rounded-xl border border-app-border bg-app-card p-0 text-app-text shadow-2xl shadow-black/60"
    >
      {open && (
        <div className="flex flex-col gap-5 p-5">
          <div className="flex items-center justify-between">
            <h2 id="settings-title" className="text-lg font-semibold">
              Settings
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="rounded p-1 text-app-muted hover:bg-app-raised hover:text-app-text"
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          <Segmented
            name="speed"
            legend="Speed"
            options={SPEED_OPTIONS}
            columns={3}
            value={overlay.speed}
            onChange={(speed) => setOverlay({ speed })}
          />

          <div className="flex flex-col gap-3">
            <Segmented
              name="position"
              legend="Position"
              options={[
                { id: 'top', label: 'Top' },
                { id: 'bottom', label: 'Bottom' },
              ]}
              value={overlay.position}
              onChange={(position) => setOverlay({ position })}
              disabled={!isTauri}
              columns={2}
            />
            <label
              className={clsx(
                'flex items-center gap-3 text-sm',
                isTauri ? 'cursor-pointer text-app-text' : 'cursor-not-allowed text-app-muted opacity-50',
              )}
            >
              <input
                type="checkbox"
                checked={overlay.reserveSpace}
                disabled={!isTauri}
                onChange={(e) => setOverlay({ reserveSpace: e.target.checked })}
                className="h-4 w-4 accent-app-accent"
              />
              Keep windows from covering it
            </label>
            {!isTauri && <p className="text-xs text-app-muted">Position works in the desktop app.</p>}
          </div>

          <Segmented
            name="color"
            legend="Color"
            options={COLOR_PRESETS.map((preset) => ({
              id: preset.id,
              ariaLabel: preset.label,
              label: (
                <>
                  <span aria-hidden className="flex -space-x-1">
                    {preset.colors.map((color) => (
                      <span
                        key={color}
                        className="h-3 w-3 rounded-full ring-1 ring-black/40"
                        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
                      />
                    ))}
                  </span>
                  <span className="text-xs">{preset.label}</span>
                </>
              ),
            }))}
            value={overlay.color}
            onChange={(color) => setOverlay({ color })}
            columns={2}
          />

          <section aria-labelledby="account-title" className="border-t border-app-border pt-4">
            <h3 id="account-title" className="mb-3 text-sm font-medium">
              Account
            </h3>
            {isTauri ? (
              <AuthPanel />
            ) : (
              <p className="text-sm text-app-muted">Sign in from the HabitGlo desktop app.</p>
            )}
          </section>
        </div>
      )}
    </dialog>
  )
}
