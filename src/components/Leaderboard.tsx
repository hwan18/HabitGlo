import { useState } from 'react'
import { useLeaderboardStore } from '@/stores/useLeaderboardStore'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { Flame, Trophy, RefreshCw, Globe, User, Monitor } from 'lucide-react'
import { Button } from './Button'
import { isTauri } from '@/lib/platform'

export function Leaderboard() {
  const user = useHabitsStore((s) => s.user)
  const habits = useHabitsStore((s) => s.habits)
  const toggleLeaderboardSharing = useHabitsStore((s) => s.toggleLeaderboardSharing)
  const personal = useLeaderboardStore((s) => s.personal)
  const global = useLeaderboardStore((s) => s.global)
  const myRank = useLeaderboardStore((s) => s.myRank)
  const loading = useLeaderboardStore((s) => s.loading)
  const error = useLeaderboardStore((s) => s.error)
  const refresh = useLeaderboardStore((s) => s.refresh)
  const [tab, setTab] = useState<'personal' | 'global'>('personal')
  const leaderboardSharingEnabled = habits.some((h) => h.show_on_leaderboard)

  // In browser mode, show a blurred preview with desktop app CTA
  if (!isTauri) {
    return (
      <div className="relative rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80 overflow-hidden">
        {/* Blurred placeholder content */}
        <div className="select-none blur-[3px] pointer-events-none">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy size={16} className="text-yellow-400" />
              <p className="text-sm font-semibold text-white">Habit Leaderboards</p>
            </div>
          </div>
          <div className="mb-3 flex gap-1 rounded-lg border border-white/10 bg-black/40 p-1">
            <div className="flex flex-1 items-center justify-center gap-1 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white">
              <User size={12} /> My Top 5
            </div>
            <div className="flex flex-1 items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white/50">
              <Globe size={12} /> Global Top 5
            </div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-white/50">
                <th className="py-1.5 text-left font-medium w-10">#</th>
                <th className="py-1.5 text-left font-medium">Habit</th>
                <th className="py-1.5 text-right font-medium w-20">Streak</th>
              </tr>
            </thead>
            <tbody>
              {[
                { rank: 1, text: 'NOSE BREATHING ONLY', streak: 42 },
                { rank: 2, text: 'ONE TASK AT A TIME', streak: 28 },
                { rank: 3, text: 'HYDRATE + ELECTROLYTES', streak: 15 },
                { rank: 4, text: 'TONGUE ON ROOF OF MOUTH', streak: 7 },
                { rank: 5, text: 'CONTROL THE CONTROLLABLE', streak: 3 },
              ].map((entry) => (
                <tr key={entry.rank} className="border-b border-white/5">
                  <td className="py-1.5 text-white/60">{entry.rank}</td>
                  <td className="py-1.5 text-white">{entry.text}</td>
                  <td className="py-1.5 text-right">
                    <span className="inline-flex items-center gap-1 text-orange-300">
                      <Flame size={10} />
                      {entry.streak}d
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Desktop app overlay */}
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-black/50">
          <div className="flex items-center gap-2 rounded-full border border-glow-blue/30 bg-glow-blue/10 px-4 py-1.5">
            <Monitor size={14} className="text-glow-blue" />
            <span className="text-xs font-semibold text-glow-blue/90">Desktop app</span>
          </div>
          <p className="mt-2 text-xs text-white/50 text-center max-w-[200px]">
            Streak leaderboards are available with the desktop app.
          </p>
          <a
            href="/landing.html#pricing"
            className="mt-3 flex items-center gap-2 rounded-lg bg-gradient-to-r from-glow-pink/80 to-glow-blue/60 px-4 py-2 text-xs font-semibold shadow-lg shadow-glow-pink/20 hover:shadow-glow-pink/40 transition-shadow"
          >
            Get HabitGlo
          </a>
        </div>
      </div>
    )
  }

  if (!user) return null

  const handleRefresh = () => {
    void refresh(user.id)
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-yellow-400" />
          <p className="text-sm font-semibold text-white">Habit Leaderboards</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-1"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {/* Opt-in checkbox */}
      <label className="mb-3 flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2">
        <span className="text-xs text-white/70">Share my habits on global leaderboard</span>
        <input
          type="checkbox"
          checked={leaderboardSharingEnabled}
          onChange={(e) => toggleLeaderboardSharing(e.target.checked)}
        />
      </label>

      {/* Tabs */}
      <div className="mb-3 flex gap-1 rounded-lg border border-white/10 bg-black/40 p-1">
        <button
          onClick={() => setTab('personal')}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === 'personal'
              ? 'bg-white/10 text-white'
              : 'text-white/50 hover:text-white/70'
          }`}
        >
          <User size={12} />
          My Top 5
        </button>
        <button
          onClick={() => setTab('global')}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === 'global'
              ? 'bg-white/10 text-white'
              : 'text-white/50 hover:text-white/70'
          }`}
        >
          <Globe size={12} />
          Global Top 5
        </button>
      </div>

      {error && (
        <p className="mb-2 text-xs text-red-400">{error}</p>
      )}

      {/* Personal Tab */}
      {tab === 'personal' && (
        <div>
          {personal.length === 0 ? (
            <p className="py-4 text-center text-xs text-white/40">
              No active streaks yet. Log a habit to start!
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 text-white/50">
                  <th className="py-1.5 text-left font-medium w-10">#</th>
                  <th className="py-1.5 text-left font-medium">Habit</th>
                  <th className="py-1.5 text-right font-medium w-20">Streak</th>
                </tr>
              </thead>
              <tbody>
                {personal.map((entry) => (
                  <tr key={entry.rank} className="border-b border-white/5">
                    <td className="py-1.5 text-white/60">{entry.rank}</td>
                    <td className="max-w-0 py-1.5 text-white">
                      <span
                        className="block truncate"
                        title={entry.habit_text}
                      >
                        {entry.habit_text}
                      </span>
                    </td>
                    <td className="py-1.5 text-right">
                      <span className="inline-flex items-center gap-1 text-orange-300">
                        <Flame size={10} />
                        {entry.streak_days}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Global Tab */}
      {tab === 'global' && (
        <div>
          {global.length === 0 && myRank.rank == null ? (
            <p className="py-4 text-center text-xs text-white/40">
              No global streaks yet. Be the first!
            </p>
          ) : (
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr className="border-b border-white/10 text-white/50">
                  <th className="border-b border-white/10 py-1.5 text-left font-medium w-10">#</th>
                  <th className="border-b border-white/10 py-1.5 text-left font-medium">User</th>
                  <th className="border-b border-white/10 py-1.5 text-left font-medium">Habit</th>
                  <th className="border-b border-white/10 py-1.5 text-right font-medium w-20">Streak</th>
                </tr>
              </thead>
              <tbody>
                {global.map((entry) => (
                  <tr key={entry.rank}>
                    <td className="border-b border-white/5 py-1.5 text-white/60">{entry.rank}</td>
                    <td className="border-b border-white/5 max-w-0 py-1.5 text-white/70">
                      <span
                        className="block truncate"
                        title={entry.username}
                      >
                        {entry.username}
                      </span>
                    </td>
                    <td className="border-b border-white/5 max-w-0 py-1.5 text-white">
                      <span
                        className="block truncate"
                        title={entry.habit_text}
                      >
                        {entry.habit_text}
                      </span>
                    </td>
                    <td className="border-b border-white/5 py-1.5 text-right">
                      <span className="inline-flex items-center gap-1 text-orange-300">
                        <Flame size={10} />
                        {entry.streak_days}d
                      </span>
                    </td>
                  </tr>
                ))}
                {/* Spacer row for gap before rank bubble */}
                {myRank.rank != null && (
                  <tr><td colSpan={4} className="h-3" /></tr>
                )}
                {/* My Global Rank row styled as bubble */}
                {myRank.rank != null && (
                  <tr>
                    <td className="rounded-l-lg border-y border-l border-white/10 bg-black/30 py-2 text-white/60" style={{ boxShadow: '-8px 0 0 0 rgba(0,0,0,0.3)', clipPath: 'inset(0 0 0 -8px)' }}>{myRank.rank}</td>
                    <td className="border-y border-white/10 bg-black/30 max-w-0 py-2 text-white font-medium">
                      <span className="block truncate">You</span>
                    </td>
                    <td className="border-y border-white/10 bg-black/30 max-w-0 py-2 text-white/70">
                      <span
                        className="block truncate"
                        title={myRank.habit_text ?? ''}
                      >
                        {myRank.habit_text ?? '—'}
                      </span>
                    </td>
                    <td className="rounded-r-lg border-y border-r border-white/10 bg-black/30 py-2 text-right" style={{ boxShadow: '8px 0 0 0 rgba(0,0,0,0.3)', clipPath: 'inset(0 -8px 0 0)' }}>
                      <span className="inline-flex items-center gap-1 text-orange-300">
                        <Flame size={10} />
                        {myRank.streak_days}d
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
