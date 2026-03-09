import { useEffect, useRef, useState } from 'react'
import { AuthPanel } from './components/AuthPanel'
import { HabitForm } from './components/HabitForm'
import { HabitPacks } from './components/HabitPacks'
import { CompletedToday } from './components/CompletedToday'
import { HabitList } from './components/HabitList'
import { SettingsPanel } from './components/SettingsPanel'
import { Leaderboard } from './components/Leaderboard'
import { useHabitsStore } from './stores/useHabitsStore'
import { Marquee } from './overlay/Marquee'
import { Rocket, Download, Monitor, Check } from 'lucide-react'
import { hasSupabase } from './lib/supabaseClient'
import { isTauri } from './lib/platform'
import { applyUiTheme } from './lib/uiThemes'
import './App.css'

type OverlayToggleButtonProps = {
  paused: boolean
  onToggle: () => void
}

function PlayGlyph() {
  return (
    <span
      aria-hidden
      className="block h-5 w-5 bg-white"
      style={{ clipPath: 'polygon(24% 12%, 24% 88%, 88% 50%)' }}
    />
  )
}

function PauseGlyph() {
  return (
    <span aria-hidden className="flex h-5 w-5 items-center justify-center gap-[3px]">
      <span className="h-4 w-[4px] rounded-sm bg-white" />
      <span className="h-4 w-[4px] rounded-sm bg-white" />
    </span>
  )
}

function OverlayToggleButton({ paused, onToggle }: OverlayToggleButtonProps) {
  const [showTick, setShowTick] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const label = paused ? 'Start Glo' : 'Pause Glo'

  const handleClick = () => {
    onToggle()
    setShowTick(true)
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = window.setTimeout(() => setShowTick(false), 110)
  }

  return (
    <button
      type="button"
      onPointerDown={() => setIsPressed(true)}
      onPointerUp={() => setIsPressed(false)}
      onPointerLeave={() => setIsPressed(false)}
      onPointerCancel={() => setIsPressed(false)}
      onClick={handleClick}
      title={label}
      aria-label={label}
      className={`group relative inline-flex h-14 w-20 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 shadow-inner shadow-black/50 transition-all duration-100 ease-out hover:border-glow-pink/50 hover:bg-white/15 hover:shadow-glow active:shadow-glow ${isPressed ? 'scale-[0.96] brightness-110' : 'scale-100'}`}
    >
      <span className="sr-only">{label}</span>
      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-glow-pink to-glow-blue text-white shadow-glow transition-transform duration-100 ease-out group-hover:scale-105 ${isPressed ? 'scale-90' : 'scale-100'}`}>
        {showTick ? <Check size={20} strokeWidth={3} className="text-white" /> : paused ? <PlayGlyph /> : <PauseGlyph />}
      </span>
    </button>
  )
}

function App() {
  const setOverlay = useHabitsStore((s) => s.setOverlay)
  const paused = useHabitsStore((s) => s.overlay.paused)
  const user = useHabitsStore((s) => s.user)
  const authReady = useHabitsStore((s) => s.authReady)
  const authInitializing = useHabitsStore((s) => s.authInitializing)
  const subscriptionStatus = useHabitsStore((s) => s.subscriptionStatus)
  const subscriptionLoading = useHabitsStore((s) => s.subscriptionLoading)
  const hasHabits = useHabitsStore((s) => s.habits.length > 0)
  const uiThemeId = useHabitsStore((s) => s.theme.uiThemeId)

  useEffect(() => {
    applyUiTheme(uiThemeId)
  }, [uiThemeId])

  // In browser mode, never require auth — let users try freely with local storage
  const billingGateFlag = import.meta.env.VITE_BILLING_GATE
  const billingGateEnabled = import.meta.env.DEV ? billingGateFlag === 'true' : billingGateFlag !== 'false'
  const restoringSession = isTauri && hasSupabase && !authReady
  const requiresAuth = isTauri && hasSupabase && authReady && !user
  const hasPaidAccess =
    subscriptionStatus === 'active' ||
    subscriptionStatus === 'trialing' ||
    subscriptionStatus === 'lifetime'
  const checkingSubscription =
    billingGateEnabled && isTauri && hasSupabase && authReady && !!user && subscriptionLoading
  const requiresSubscription =
    billingGateEnabled &&
    isTauri &&
    hasSupabase &&
    authReady &&
    !!user &&
    !subscriptionLoading &&
    !hasPaidAccess

  return (
    <div className="app-shell min-h-screen px-6 pb-10 text-white">
      {/* Browser trial banner */}
      {!isTauri && (
        <div className="mx-auto mt-4 max-w-6xl rounded-xl border border-glow-pink/20 bg-gradient-to-r from-glow-pink/10 via-glow-blue/10 to-glow-green/10 px-5 py-3">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <div className="flex items-center gap-3">
              <Monitor size={18} className="text-glow-blue" />
              <div>
                <p className="text-sm font-semibold text-white">Browser Preview — Try HabitGlo</p>
                <p className="text-xs text-white/50">
                  Add habits, choose themes, and preview the overlay. Get the desktop app for always-on-top, click-through mode, and cloud sync.
                </p>
              </div>
            </div>
            <a
              href="/pricing"
              className="flex shrink-0 items-center gap-2 rounded-lg bg-gradient-to-r from-glow-pink/80 to-glow-blue/60 px-4 py-2 text-sm font-semibold shadow-lg shadow-glow-pink/20 hover:shadow-glow-pink/40 transition-shadow"
            >
              <Download size={14} />
              Get HabitGlo
            </a>
          </div>
        </div>
      )}

      <header className="mx-auto max-w-6xl pt-8">
        {/* Desktop: message left, preview right (original layout) */}
        {isTauri ? (
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">HabitGlo · Peripheral productivity</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">Ambient reminders on your screen.</h1>
              <p className="mt-2 max-w-xl text-sm text-white/70">
                Keep your habits and reminders visible—all day, on your screen.
              </p>
              {!requiresAuth && !restoringSession && (
                <div className="mt-4">
                  <OverlayToggleButton paused={paused} onToggle={() => setOverlay({ paused: !paused })} />
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
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-glow-pink/20">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-white/60">
                <Rocket size={14} />
                Live Overlay Preview
              </div>
              <div className="mt-2 h-24 w-full overflow-hidden rounded-xl border border-white/10 bg-black/60 shadow-inner shadow-black/70">
                <Marquee />
              </div>
            </div>
            <div className="mt-6">
              <p className="text-center text-xs uppercase tracking-[0.3em] text-white/60">HabitGlo · Peripheral productivity</p>
              <div className="mt-2 flex items-center justify-center gap-4">
                <h1 className="min-w-0 text-center text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Ambient reminders on your screen.
                </h1>
                {!requiresAuth && !restoringSession && (
                  <div className="shrink-0">
                    <OverlayToggleButton paused={paused} onToggle={() => setOverlay({ paused: !paused })} />
                  </div>
                )}
              </div>
              <p className="mx-auto mt-2 max-w-xl text-center text-sm text-white/70">
                Keep your habits and reminders visible—all day, on your screen.
              </p>
            </div>
          </>
        )}
      </header>

      {restoringSession ? (
        <main className="mx-auto mt-8 grid max-w-4xl gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/80">
            <h2 className="text-lg font-semibold text-white">Restoring session</h2>
            <p className="mt-2 text-sm text-white/70">
              {authInitializing ? 'Reconnecting your account...' : 'Preparing your account state...'}
            </p>
          </div>
        </main>
      ) : requiresAuth ? (
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
      ) : checkingSubscription ? (
        <main className="mx-auto mt-8 grid max-w-4xl gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/80">
            <h2 className="text-lg font-semibold text-white">Checking subscription</h2>
            <p className="mt-2 text-sm text-white/70">
              Verifying your billing status...
            </p>
          </div>
        </main>
      ) : requiresSubscription ? (
        <main className="mx-auto mt-8 grid max-w-4xl gap-4">
          <div className="rounded-2xl border border-glow-pink/25 bg-white/5 p-6 text-sm text-white/80">
            <h2 className="text-lg font-semibold text-white">Subscription required</h2>
            <p className="mt-2 text-sm text-white/70">
              Your account is signed in, but desktop access requires an active subscription.
            </p>
            <p className="mt-2 text-xs uppercase tracking-wide text-white/60">
              Current status: {subscriptionStatus}
            </p>
            <div className="mt-4">
              <AuthPanel />
            </div>
          </div>
        </main>
      ) : (
        <main className="mx-auto mt-8 grid max-w-6xl gap-4 md:grid-cols-3">
          <div className="md:col-span-2 flex flex-col gap-4">
            <HabitForm highlighted={!isTauri && !hasHabits} />
            <HabitList />
            <HabitPacks />
            <CompletedToday />
            {isTauri && <AuthPanel />}
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
            {/* Browser-only download CTA card */}
            {!isTauri && (
              <div className="rounded-xl border border-glow-pink/20 bg-gradient-to-br from-glow-pink/10 to-glow-blue/10 p-4 text-sm">
                <p className="font-semibold text-white">Want the full experience?</p>
                <p className="mt-1 text-xs text-white/50">
                  The desktop app adds always-on-top overlay, click-through mode, cloud sync, streak leaderboards, and more.
                </p>
                <a
                  href="/pricing"
                  className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-glow-pink/80 to-glow-blue/60 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-glow-pink/20 hover:shadow-glow-pink/40 transition-shadow"
                >
                  <Download size={14} />
                  Get HabitGlo
                </a>
              </div>
            )}
          </div>
        </main>
      )}

      <footer className="mx-auto mt-8 max-w-6xl border-t border-white/10 pt-4 text-xs text-white/50">
        {isTauri
          ? 'Sync ready: Supabase Realtime. Overlay: Tauri always-on-top with click-through toggle.'
          : 'Browser preview mode — Download the desktop app for the full always-on-top overlay experience.'}
      </footer>
    </div>
  )
}

export default App
