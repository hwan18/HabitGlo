import { useState } from 'react'
import { supabase, hasSupabase } from '@/lib/supabaseClient'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { Button } from './Button'
import {
  billingProviderLabel,
  openBillingPortal,
  openWebsitePricing,
  startCheckout as startBillingCheckout,
} from '@/lib/billing'

export function AuthPanel() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup' | 'magic'>('login')
  const [status, setStatus] = useState<string | null>(null)
  const [billingBusy, setBillingBusy] = useState(false)
  const user = useHabitsStore((s) => s.user)
  const subscriptionStatus = useHabitsStore((s) => s.subscriptionStatus)
  const refreshSubscriptionStatus = useHabitsStore((s) => s.refreshSubscriptionStatus)

  const isPaid =
    subscriptionStatus === 'active' ||
    subscriptionStatus === 'trialing' ||
    subscriptionStatus === 'lifetime'
  const isLifetime = subscriptionStatus === 'lifetime'

  const sendMagicLink = async () => {
    if (!supabase) return
    setStatus('Sending magic link...')
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) {
      setStatus(error.message)
      return
    }
    setStatus('Check your email for the login link.')
  }

  const signInWithPassword = async () => {
    if (!supabase) return
    setStatus('Signing in...')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setStatus(error.message)
      return
    }
    setStatus(null)
  }

  const signUpWithPassword = async () => {
    if (!supabase) return
    setStatus('Creating account...')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setStatus(error.message)
      return
    }
    setStatus('Check your email to confirm your account.')
  }

  const signOut = async () => {
    await supabase?.auth.signOut()
  }

  const handleCheckout = async (plan: 'monthly' | 'lifetime') => {
    try {
      setBillingBusy(true)
      setStatus(`Opening ${billingProviderLabel} checkout...`)
      const result = await startBillingCheckout(plan, { email: user?.email ?? null, userId: user?.id ?? null })
      if (result.action === 'checkout_opened') {
        setStatus('Checkout opened. Complete payment, then click "Refresh billing status".')
        return
      }
      if (result.action === 'portal_opened') {
        setStatus('You already have an active recurring plan. Billing portal opened instead.')
        return
      }
      setStatus('This account already has lifetime access.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start checkout'
      setStatus(message)
    } finally {
      setBillingBusy(false)
    }
  }

  const openPortal = async () => {
    try {
      setBillingBusy(true)
      setStatus(`Opening ${billingProviderLabel} billing portal...`)
      await openBillingPortal()
      setStatus('Billing portal opened.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open billing portal'
      setStatus(message)
    } finally {
      setBillingBusy(false)
    }
  }

  const refreshBilling = async () => {
    try {
      setBillingBusy(true)
      setStatus('Refreshing billing status...')
      await refreshSubscriptionStatus()
      setStatus('Billing status refreshed.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh billing status'
      setStatus(message)
    } finally {
      setBillingBusy(false)
    }
  }

  const openPlanDetails = async (plan?: 'monthly' | 'lifetime') => {
    try {
      setBillingBusy(true)
      setStatus('Opening plan details on the website...')
      await openWebsitePricing(plan)
      setStatus('Plan details opened in your browser.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open plan details'
      setStatus(message)
    } finally {
      setBillingBusy(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (mode === 'magic') {
        void sendMagicLink()
      } else if (mode === 'signup') {
        void signUpWithPassword()
      } else {
        void signInWithPassword()
      }
    }
  }

  if (!hasSupabase) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
        <div className="font-semibold text-white">Offline demo</div>
        <p className="mt-2">No Supabase keys detected. Data will be stored locally.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-white/80">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Account</p>
          <p className="text-xs text-white/60">
            {user ? 'Signed in' : mode === 'magic' ? 'Magic link login' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </p>
        </div>
        {user && (
          <Button size="sm" variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        )}
      </div>
      {!user ? (
        <div className="mt-3 space-y-3">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === 'login' ? 'primary' : 'ghost'}
              onClick={() => setMode('login')}
            >
              Sign in
            </Button>
            <Button
              size="sm"
              variant={mode === 'signup' ? 'primary' : 'ghost'}
              onClick={() => setMode('signup')}
            >
              Sign up
            </Button>
            <Button
              size="sm"
              variant={mode === 'magic' ? 'primary' : 'ghost'}
              onClick={() => setMode('magic')}
            >
              Magic link
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <input
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-glow-pink"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {mode !== 'magic' && (
              <input
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-glow-pink"
                placeholder="••••••••"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            )}
          </div>
          {mode === 'magic' ? (
            <Button onClick={sendMagicLink}>Send link</Button>
          ) : mode === 'signup' ? (
            <Button onClick={signUpWithPassword}>Create account</Button>
          ) : (
            <Button onClick={signInWithPassword}>Sign in</Button>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3 text-xs text-white/70">
          <div>Logged in as {user.email}</div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-white/70">Subscription</span>
              <span className="rounded bg-white/10 px-2 py-0.5 uppercase tracking-wide text-white">
                {subscriptionStatus}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {!isPaid && (
                <>
                  <Button size="sm" onClick={() => void handleCheckout('monthly')} disabled={billingBusy}>
                    Start Monthly
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void handleCheckout('lifetime')} disabled={billingBusy}>
                    Buy Lifetime
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void openPlanDetails()} disabled={billingBusy}>
                    View Plan Details
                  </Button>
                </>
              )}
              {isPaid && !isLifetime && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => void handleCheckout('lifetime')} disabled={billingBusy}>
                    Upgrade to Lifetime
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void openPortal()} disabled={billingBusy}>
                    Manage Billing
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={() => void refreshBilling()} disabled={billingBusy}>
                Refresh Billing Status
              </Button>
            </div>
          </div>
        </div>
      )}
      {status && <div className="mt-2 text-xs text-glow-amber">{status}</div>}
    </div>
  )
}
