import { useEffect } from 'react'
import { AuthPanel } from './components/AuthPanel'
import { HabitForm } from './components/HabitForm'
import { HabitPacks } from './components/HabitPacks'
import { CompletedToday } from './components/CompletedToday'
import { HabitList } from './components/HabitList'
import { SettingsPanel } from './components/SettingsPanel'
import { Leaderboard } from './components/Leaderboard'
import { useHabitsStore } from './stores/useHabitsStore'
import { Marquee } from './overlay/Marquee'
import { Button } from './components/Button'
import { Pause, Play, Rocket } from 'lucide-react'
import { hasSupabase } from './lib/supabaseClient'
import './App.css'

function App() {
  const setOverlay = useHabitsStore((s) => s.setOverlay)
  const paused = useHabitsStore((s) => s.overlay.paused)
  const user = useHabitsStore((s) => s.user)

  useEffect(() => {
    document.body.classList.add('bg-slate-950')
  }, [])

  const requiresAuth = hasSupabase && !user

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-slate-950 px-6 pb-10 text-white">
      <header className="mx-auto flex max-w-6xl flex-col gap-4 pt-8 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">HabitGlo · Peripheral productivity</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">Ambient reminders in your periphery.</h1>
          <p className="mt-2 max-w-xl text-sm text-white/70">
            Always-on-top LED ticker with click-through mode, Supabase sync, and themeable glow. Set your habits once and let the overlay whisper them all day.
          </p>
          {!requiresAuth && (
            <div className="mt-4 flex gap-2">
              <Button
                variant={paused ? 'primary' : 'ghost'}
                onClick={() => setOverlay({ paused: false })}
                className="flex items-center gap-2"
              >
                <Play size={16} />
                Start Glo
              </Button>
              <Button
                variant={paused ? 'ghost' : 'primary'}
                onClick={() => setOverlay({ paused: true })}
                className="flex items-center gap-2"
              >
                <Pause size={16} />
                Pause Glo
              </Button>
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-glow-pink/20">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-white/60">
            <Rocket size={14} />
            Live Overlay Preview
          </div>
          <div className="mt-2 h-24 w-[480px] max-w-full overflow-hidden rounded-xl border border-white/10 bg-black/60 shadow-inner shadow-black/70">
            <Marquee />
          </div>
        </div>
      </header>

      {requiresAuth ? (
        <main className="mx-auto mt-8 grid max-w-4xl gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/80">
            <h2 className="text-lg font-semibold text-white">Create your account</h2>
            <p className="mt-2 text-sm text-white/70">
              Sign in to sync habits across devices and keep your data private.
            </p>
            <div className="mt-4">
              <AuthPanel />
            </div>
          </div>
        </main>
      ) : (
        <main className="mx-auto mt-8 grid max-w-6xl gap-4 md:grid-cols-3">
          <div className="md:col-span-2 flex flex-col gap-4">
            <AuthPanel />
            <HabitForm />
            <HabitList />
            <HabitPacks />
            <CompletedToday />
          </div>
          <div className="flex flex-col gap-4">
            <SettingsPanel />
            <Leaderboard />
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
              <p className="text-sm font-semibold text-white">Tips</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
                <li>Use click-through mode when coding or presenting.</li>
                <li>Drag habits to prioritize what appears most often.</li>
                <li>Use Synthwave palette + high glow for neon effect.</li>
              </ul>
            </div>
          </div>
        </main>
      )}

      <footer className="mx-auto mt-8 max-w-6xl border-t border-white/10 pt-4 text-xs text-white/50">
        Sync ready: Supabase Realtime. Overlay: Tauri always-on-top with click-through toggle.
      </footer>
    </div>
  )
}

export default App
