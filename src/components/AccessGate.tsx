import { useState, type ReactNode } from 'react'
import { WifiOff } from 'lucide-react'
import type { AccessDecision } from '@/lib/entitlement'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { AuthPanel } from './AuthPanel'
import { Button } from './Button'

type Props = { decision: Exclude<AccessDecision, { kind: 'open' }> }

function Card({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <section aria-busy={busy || undefined} className="rounded-xl border border-app-border bg-app-card p-5">
      {children}
    </section>
  )
}

/** Full-screen state shown instead of the app when desktop access is not (yet) confirmed. */
export function AccessGate({ decision }: Props) {
  const refreshSubscriptionStatus = useHabitsStore((s) => s.refreshSubscriptionStatus)
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
      <Card busy>
        <h2 className="text-lg font-semibold">Opening HabitGlo…</h2>
        <p className="mt-2 text-sm text-app-muted">Checking your account.</p>
      </Card>
    )
  }

  if (decision.kind === 'verify-offline') {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <WifiOff size={22} className="text-app-muted" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold">Connect to the internet to verify your HabitGlo subscription</h2>
          <p className="mt-2 text-sm text-app-muted">
            HabitGlo works offline for 14 days after your last check. Your reminders are saved on this PC.
          </p>
          <Button className="mt-4" onClick={() => void retry()} disabled={retrying}>
            {retrying ? 'Checking…' : 'Retry'}
          </Button>
        </Card>
        {decision.showSignIn && (
          <Card>
            <AuthPanel />
          </Card>
        )}
      </div>
    )
  }

  if (decision.kind === 'subscribe') {
    return (
      <Card>
        <h2 className="text-lg font-semibold">Subscription required</h2>
        <p className="mb-4 mt-2 text-sm text-app-muted">You are signed in, but the desktop app needs an active plan.</p>
        <AuthPanel />
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">Sign in to HabitGlo</h2>
      <p className="mb-4 mt-2 text-sm text-app-muted">Sign in once; after that HabitGlo also works offline.</p>
      <AuthPanel />
    </Card>
  )
}
