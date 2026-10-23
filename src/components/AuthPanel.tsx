import { useState, type FormEvent } from 'react'
import { supabase, hasSupabase } from '@/lib/supabaseClient'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { isPaidStatus } from '@/lib/entitlement'
import type { SubscriptionStatus } from '@/lib/db'
import { Button } from './Button'
import {
  billingProviderLabel,
  openBillingPortal,
  openWebsitePricing,
  startCheckout as startBillingCheckout,
} from '@/lib/billing'
import posthog, { isPostHogConfigured } from '@/lib/posthog'

const PLAN_LABELS: Record<SubscriptionStatus, string> = {
  free: 'No plan',
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Payment due',
  canceled: 'Canceled',
  lifetime: 'Lifetime',
}

const inputClass =
  'chamfer chamfer-field h-10 w-full px-3 text-sm placeholder:text-app-muted'

function SignInForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup' | 'magic'>('login')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase || busy) return
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setStatus('Enter your email.')
      return
    }
    if (!navigator.onLine) {
      setStatus('You are offline. Connect to the internet to sign in.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'magic') {
        setStatus('Sending link…')
        const { error } = await supabase.auth.signInWithOtp({ email: trimmedEmail })
        if (error) return setStatus(error.message)
        setStatus('Check your email for the sign-in link.')
        if (isPostHogConfigured) posthog.capture('magic_link_requested')
      } else if (mode === 'signup') {
        setStatus('Creating account…')
        const { error } = await supabase.auth.signUp({ email: trimmedEmail, password })
        if (error) return setStatus(error.message)
        setStatus('Check your email to confirm your account.')
        if (isPostHogConfigured) posthog.capture('account_created', { authentication_method: 'password' })
      } else {
        setStatus('Signing in…')
        const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password })
        if (error) return setStatus(error.message)
        setStatus(null)
        if (isPostHogConfigured) posthog.capture('sign_in_completed', { authentication_method: 'password' })
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const switchMode = (next: typeof mode) => {
    setMode(next)
    setStatus(null)
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-2">
      <label className="text-xs text-app-muted" htmlFor="auth-email">
        Email
      </label>
      <input
        id="auth-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputClass}
      />
      {mode !== 'magic' && (
        <>
          <label className="text-xs text-app-muted" htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </>
      )}
      <Button type="submit" disabled={busy} className="mt-1">
        {mode === 'magic' ? 'Email me a sign-in link' : mode === 'signup' ? 'Create account' : 'Sign in'}
      </Button>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {mode !== 'login' && (
          <button type="button" className="text-app-muted underline hover:text-app-text" onClick={() => switchMode('login')}>
            Sign in with password
          </button>
        )}
        {mode !== 'signup' && (
          <button type="button" className="text-app-muted underline hover:text-app-text" onClick={() => switchMode('signup')}>
            Create account
          </button>
        )}
        {mode !== 'magic' && (
          <button type="button" className="text-app-muted underline hover:text-app-text" onClick={() => switchMode('magic')}>
            Email me a link instead
          </button>
        )}
      </div>
      {status && (
        <p role="status" className="text-xs text-app-accent">
          {status}
        </p>
      )}
    </form>
  )
}

export function AuthPanel() {
  const user = useHabitsStore((s) => s.user)
  const subscriptionStatus = useHabitsStore((s) => s.subscriptionStatus)
  const offlineSession = useHabitsStore((s) => s.offlineSession)
  const refreshSubscriptionStatus = useHabitsStore((s) => s.refreshSubscriptionStatus)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!hasSupabase) {
    return <p className="text-sm text-app-muted">Accounts are not set up in this build. Your reminders are saved on this PC.</p>
  }

  if (!user) return <SignInForm />

  const isPaid = isPaidStatus(subscriptionStatus)
  const isLifetime = subscriptionStatus === 'lifetime'

  const run = async (pending: string, action: () => Promise<string | null>) => {
    setBusy(true)
    setStatus(pending)
    try {
      setStatus(await action())
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const subscribe = () =>
    run(`Opening ${billingProviderLabel} checkout…`, async () => {
      const result = await startBillingCheckout('monthly', { email: user.email ?? null, userId: user.id })
      if (result.action === 'checkout_opened') {
        if (isPostHogConfigured) posthog.capture('checkout_started', { billing_plan: 'monthly' })
        return 'Checkout opened. When you are done, click "Refresh status".'
      }
      if (result.action === 'portal_opened') return 'You already have a plan. Billing page opened instead.'
      return 'This account already has lifetime access.'
    })

  const manageBilling = () =>
    run('Opening billing…', async () => {
      await openBillingPortal()
      if (isPostHogConfigured) posthog.capture('billing_portal_opened')
      return null
    })

  const refresh = () =>
    run('Checking your plan…', async () => {
      await refreshSubscriptionStatus()
      return null
    })

  return (
    <div className="flex flex-col gap-3 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-app-muted">Email</dt>
        <dd className="min-w-0 truncate text-app-text" title={user.email ?? undefined}>
          {user.email ?? 'Signed in'}
        </dd>
        <dt className="text-app-muted">Plan</dt>
        <dd className="text-app-text">
          {PLAN_LABELS[subscriptionStatus]}
          {offlineSession && <span className="text-app-muted"> (offline)</span>}
        </dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        {!isPaid && (
          <Button size="sm" onClick={() => void subscribe()} disabled={busy}>
            Subscribe
          </Button>
        )}
        {isPaid && !isLifetime && (
          <Button size="sm" variant="ghost" onClick={() => void manageBilling()} disabled={busy}>
            Manage billing
          </Button>
        )}
        {!isPaid && (
          <Button size="sm" variant="ghost" onClick={() => void openWebsitePricing()} disabled={busy}>
            See plans
          </Button>
        )}
        {!isPaid && (
          <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={busy}>
            Refresh status
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => void useHabitsStore.getState().signOut()} disabled={busy}>
          Sign out
        </Button>
      </div>
      {status && (
        <p role="status" className="text-xs text-app-accent">
          {status}
        </p>
      )}
    </div>
  )
}
