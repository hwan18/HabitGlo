import { useState } from 'react'
import { WifiOff } from 'lucide-react'
import type { AccessDecision } from '@/lib/entitlement'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { AuthPanel } from './AuthPanel'
import { Button } from './Button'

type Props = { decision: Exclude<AccessDecision, { kind: 'open' }> }

/** Full-screen state shown instead of the app when desktop access is not (yet) confirmed. */
export function AccessGate({ decision }: Props) {
  const refreshSubscriptionStatus = useHabitsStore((s) => s.refreshSubscriptionStatus)
  const subscriptionStatus = useHabitsStore((s) => s.subscriptionStatus)
  const [retrying, setRetrying] = useState(false)

  const retry = async () => {
    setRetrying(true)
    try {
      await refreshSubscriptionStatus()
    } finally {
      setRetrying(false)
    }
  }

  if (decision.kind === 'restoring') {
    return (
      <section className="rounded-xl border border-white/10 bg-white/5 p-6" aria-busy="true">
        <h2 className="text-lg font-semibold text-white">Opening HabitGlo…</h2>
        <p className="mt-2 text-sm text-white/70">Checking your account.</p>
      </section>
    )
  }

  if (decision.kind === 'verify-offline') {
    return (
      <section className="flex flex-col gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <WifiOff size={22} className="text-white/70" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold text-white">Connect to the internet to verify your HabitGlo subscription</h2>
          <p className="mt-2 text-sm text-white/70">
            HabitGlo works offline for 14 days after your last check. Your reminders are saved on this PC.
          </p>
          <Button className="mt-4" onClick={() => void retry()} disabled={retrying}>
            {retrying ? 'Checking…' : 'Retry'}
          </Button>
        </div>
        {decision.showSignIn && <AuthPanel />}
      </section>
    )
  }

  if (decision.kind === 'subscribe') {
    return (
      <section className="flex flex-col gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white">Subscription required</h2>
          <p className="mt-2 text-sm text-white/70">
            You are signed in, but the desktop app needs an active plan. Current status: {subscriptionStatus}.
          </p>
        </div>
        <AuthPanel />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-semibold text-white">Sign in to HabitGlo</h2>
        <p className="mt-2 text-sm text-white/70">Sign in once; after that HabitGlo also works offline.</p>
      </div>
      <AuthPanel />
    </section>
  )
}
