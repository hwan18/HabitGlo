import type { SubscriptionStatus } from './db'

/** Last successful online subscription check, so the desktop app can open offline. */
export type CachedEntitlement = {
  userId: string
  email: string | null
  status: SubscriptionStatus
  checkedAt: number
}

export const ENTITLEMENT_CACHE_KEY = 'habitglo-entitlement-v1'
export const OFFLINE_GRACE_MS = 14 * 24 * 60 * 60 * 1000
/** A check timestamp further in the future than this is treated as tampered / clock skew and ignored. */
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000

export const isPaidStatus = (status: SubscriptionStatus | null | undefined) =>
  status === 'active' || status === 'trialing' || status === 'lifetime'

export const readCachedEntitlement = (storage: Storage = window.localStorage): CachedEntitlement | null => {
  try {
    const parsed = JSON.parse(storage.getItem(ENTITLEMENT_CACHE_KEY) ?? 'null') as Partial<CachedEntitlement> | null
    if (!parsed || typeof parsed.userId !== 'string' || typeof parsed.checkedAt !== 'number') return null
    return {
      userId: parsed.userId,
      email: typeof parsed.email === 'string' ? parsed.email : null,
      status: (parsed.status ?? 'free') as SubscriptionStatus,
      checkedAt: parsed.checkedAt,
    }
  } catch {
    return null
  }
}

export const writeCachedEntitlement = (entry: CachedEntitlement, storage: Storage = window.localStorage) => {
  try {
    storage.setItem(ENTITLEMENT_CACHE_KEY, JSON.stringify(entry))
  } catch (err) {
    console.warn('Failed to cache subscription status:', err)
  }
}

export const clearCachedEntitlement = (storage: Storage = window.localStorage) => {
  try {
    storage.removeItem(ENTITLEMENT_CACHE_KEY)
  } catch {
    /* ignore */
  }
}

export const isCacheWithinGrace = (cache: CachedEntitlement | null, userId: string | null, now: number) => {
  if (!cache || !userId || cache.userId !== userId || !isPaidStatus(cache.status)) return false
  const age = now - cache.checkedAt
  return age <= OFFLINE_GRACE_MS && age >= -MAX_CLOCK_SKEW_MS
}

/** `ok`: the server answered; `failed`: network or session problem, the answer is unknown. */
export type SubscriptionCheck = 'idle' | 'pending' | 'ok' | 'failed'

export type AccessDecision =
  | { kind: 'open'; via: 'not-gated' | 'online' | 'grace' }
  | { kind: 'restoring' }
  | { kind: 'sign-in' }
  | { kind: 'subscribe' }
  | { kind: 'verify-offline'; showSignIn: boolean }

export type AccessInput = {
  gated: boolean
  authReady: boolean
  online: boolean
  user: { id: string } | null
  check: SubscriptionCheck
  status: SubscriptionStatus
  cache: CachedEntitlement | null
  now: number
}

/**
 * Desktop access rule: paid status confirmed online now, or a cached paid status checked within
 * the last 14 days while the online check cannot complete.
 */
export const evaluateAccess = ({ gated, authReady, online, user, check, status, cache, now }: AccessInput): AccessDecision => {
  if (!gated) return { kind: 'open', via: 'not-gated' }
  if (!authReady) return { kind: 'restoring' }

  if (!user) {
    return online ? { kind: 'sign-in' } : { kind: 'verify-offline', showSignIn: !cache }
  }

  if (check === 'ok') {
    return isPaidStatus(status) ? { kind: 'open', via: 'online' } : { kind: 'subscribe' }
  }

  const graceValid = isCacheWithinGrace(cache, user.id, now)
  if (graceValid) return { kind: 'open', via: 'grace' }
  if (check === 'failed') return { kind: 'verify-offline', showSignIn: false }
  return { kind: 'restoring' }
}
