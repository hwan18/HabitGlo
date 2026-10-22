import { describe, expect, it } from 'vitest'
import {
  OFFLINE_GRACE_MS,
  evaluateAccess,
  readCachedEntitlement,
  writeCachedEntitlement,
  type AccessInput,
  type CachedEntitlement,
} from './entitlement'

const NOW = Date.UTC(2026, 9, 23, 1, 0, 0)
const DAY = 24 * 60 * 60 * 1000
const user = { id: 'u1' }
const paidCache = (ageMs: number, status: CachedEntitlement['status'] = 'active'): CachedEntitlement => ({
  userId: 'u1',
  email: 'a@b.c',
  status,
  checkedAt: NOW - ageMs,
})

const base: AccessInput = {
  gated: true,
  authReady: true,
  online: true,
  user,
  check: 'idle',
  status: 'free',
  cache: null,
  now: NOW,
}

describe('evaluateAccess', () => {
  it('online, paid: opens', () => {
    for (const status of ['active', 'trialing', 'lifetime'] as const) {
      expect(evaluateAccess({ ...base, check: 'ok', status })).toEqual({ kind: 'open', via: 'online' })
    }
  })

  it('online, unpaid: asks to subscribe even with a fresh paid cache', () => {
    for (const status of ['free', 'past_due', 'canceled'] as const) {
      expect(evaluateAccess({ ...base, check: 'ok', status, cache: paidCache(DAY) })).toEqual({ kind: 'subscribe' })
    }
  })

  it('offline within 14 days of the last paid check: opens from cache', () => {
    const input = { ...base, online: false, check: 'failed' as const }
    expect(evaluateAccess({ ...input, cache: paidCache(DAY) })).toEqual({ kind: 'open', via: 'grace' })
    expect(evaluateAccess({ ...input, cache: paidCache(OFFLINE_GRACE_MS) })).toEqual({ kind: 'open', via: 'grace' })
  })

  it('offline after 14 days: asks to connect, without the sign-in panel', () => {
    const input = { ...base, online: false, check: 'failed' as const, cache: paidCache(OFFLINE_GRACE_MS + 1) }
    expect(evaluateAccess(input)).toEqual({ kind: 'verify-offline', showSignIn: false })
  })

  it('never signed in: sign-in online, connect + sign-in panel offline', () => {
    expect(evaluateAccess({ ...base, user: null })).toEqual({ kind: 'sign-in' })
    expect(evaluateAccess({ ...base, user: null, online: false })).toEqual({ kind: 'verify-offline', showSignIn: true })
  })

  it('opens instantly from a fresh cache while the online check is still running', () => {
    expect(evaluateAccess({ ...base, check: 'pending', cache: paidCache(DAY) })).toEqual({ kind: 'open', via: 'grace' })
    expect(evaluateAccess({ ...base, check: 'pending' })).toEqual({ kind: 'restoring' })
  })

  it('ignores a cache that is unpaid, for another user, or dated in the future', () => {
    const input = { ...base, check: 'failed' as const }
    expect(evaluateAccess({ ...input, cache: paidCache(DAY, 'canceled') }).kind).toBe('verify-offline')
    expect(evaluateAccess({ ...input, cache: { ...paidCache(DAY), userId: 'other' } }).kind).toBe('verify-offline')
    expect(evaluateAccess({ ...input, cache: paidCache(-30 * DAY) }).kind).toBe('verify-offline')
  })

  it('is always open when the billing gate is off (browser preview, dev)', () => {
    expect(evaluateAccess({ ...base, gated: false, user: null, authReady: false })).toEqual({ kind: 'open', via: 'not-gated' })
  })
})

describe('entitlement cache storage', () => {
  it('round-trips and tolerates garbage', () => {
    writeCachedEntitlement(paidCache(0))
    expect(readCachedEntitlement()).toEqual(paidCache(0))
    window.localStorage.setItem('habitglo-entitlement-v1', '{oops')
    expect(readCachedEntitlement()).toBeNull()
  })
})
