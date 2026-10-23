import { useState } from 'react'
import { Settings } from 'lucide-react'
import { useHabitsStore } from './stores/useHabitsStore'
import { isTauri } from './lib/platform'
import { useAccess } from './lib/useAccess'
import { AccessGate } from './components/AccessGate'
import { LedPreview } from './components/LedPreview'
import { ReminderInput } from './components/ReminderInput'
import { ReminderList } from './components/ReminderList'
import { SettingsDialog } from './components/SettingsDialog'
import './App.css'

function App() {
  const access = useAccess()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const reminderCount = useHabitsStore((s) => s.habits.length)
  const isOpen = access.kind === 'open'

  return (
    <div className="min-h-screen bg-app-bg text-app-text">
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-5 pb-8 pt-5">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/icons/habitglo-logo-32.png" alt="" className="h-6 w-6" />
            <h1 className="text-lg font-semibold">HabitGlo</h1>
          </div>
          {isOpen && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
              title="Settings"
              className="p-2 text-app-muted hover:text-app-text"
            >
              <Settings size={20} aria-hidden />
            </button>
          )}
        </header>

        {!isTauri && (
          <p className="text-xs text-app-muted">
            Browser preview. The LED strip on your desktop needs the{' '}
            <a href="/pricing" className="text-app-accent underline">
              HabitGlo app
            </a>
            .
          </p>
        )}

        {isOpen ? (
          <main className="flex flex-col gap-6">
            <LedPreview />
            <ReminderInput />
            <section aria-label="Reminders" className="flex flex-col gap-2">
              {reminderCount > 0 && (
                <h2 className="text-sm text-app-muted">Your reminders, {reminderCount}</h2>
              )}
              <ReminderList />
            </section>
          </main>
        ) : (
          <main>
            <AccessGate decision={access} />
          </main>
        )}
      </div>
      <SettingsDialog open={isOpen && settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default App
