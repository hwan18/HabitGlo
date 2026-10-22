import { useEffect, useState } from 'react'
import { useHabitsStore } from '@/stores/useHabitsStore'
import { evaluateAccess, type AccessDecision } from './entitlement'
import { hasSupabase } from './supabaseClient'
import { isTauri } from './platform'

const billingGateFlag = import.meta.env.VITE_BILLING_GATE
/** Dev builds are open unless VITE_BILLING_GATE=true; release builds are gated unless VITE_BILLING_GATE=false. */
export const billingGateEnabled = import.meta.env.DEV ? billingGateFlag === 'true' : billingGateFlag !== 'false'

/** Only the desktop app is gated; the browser preview at /app is always open. */
export const isAccessGated = billingGateEnabled && isTauri && hasSupabase

const useOnlineStatus = () => {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

/** Current time, refreshed every minute so an expiring offline grace period takes effect while the app is open. */
const useMinuteClock = () => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

export const useAccess = (): AccessDecision => {
  const online = useOnlineStatus()
  const now = useMinuteClock()
  const authReady = useHabitsStore((s) => s.authReady)
  const user = useHabitsStore((s) => s.user)
  const check = useHabitsStore((s) => s.subscriptionCheck)
  const status = useHabitsStore((s) => s.subscriptionStatus)
  const cache = useHabitsStore((s) => s.cachedEntitlement)
  return evaluateAccess({ gated: isAccessGated, authReady, online, user, check, status, cache, now })
}
