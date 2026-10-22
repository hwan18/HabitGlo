import { describe, expect, it, vi } from 'vitest'
import type { Habit } from '@/types'
import {
  applyPendingOps,
  enqueue,
  flushQueue,
  isPermanentSyncError,
  readQueue,
  type RemoteHabitsApi,
} from './syncQueue'

const habit = (id: string, priority: number, text = id.toUpperCase()): Habit => ({
  id,
  text,
  colorIndex: 0,
  is_active: true,
  priority,
})

const networkError = () => Object.assign(new Error('TypeError: Failed to fetch'), { code: '' })

describe('enqueue', () => {
  it('keeps one op per habit, latest value wins', () => {
    enqueue('u1', { kind: 'upsert', habit: habit('a', 0, 'first'), isNew: true })
    enqueue('u1', { kind: 'upsert', habit: habit('a', 0, 'second'), isNew: false })
    const ops = readQueue('u1')
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ kind: 'upsert', isNew: true, habit: { text: 'second' } })
  })

  it('drops an unsynced item entirely when it is deleted', () => {
    enqueue('u1', { kind: 'upsert', habit: habit('a', 0), isNew: true })
    enqueue('u1', { kind: 'delete', id: 'a' })
    expect(readQueue('u1')).toEqual([])
  })

  it('turns an edit of a synced item into a delete', () => {
    enqueue('u1', { kind: 'upsert', habit: habit('a', 0), isNew: false })
    enqueue('u1', { kind: 'delete', id: 'a' })
    expect(readQueue('u1')).toEqual([{ kind: 'delete', id: 'a' }])
  })

  it('keeps queues separate per user', () => {
    enqueue('u1', { kind: 'delete', id: 'a' })
    enqueue('u2', { kind: 'delete', id: 'b' })
    expect(readQueue('u1')).toEqual([{ kind: 'delete', id: 'a' }])
    expect(readQueue('u2')).toEqual([{ kind: 'delete', id: 'b' }])
  })

  it('survives a corrupted queue in storage', () => {
    window.localStorage.setItem('habitglo-sync-queue-v1', '{not json')
    expect(readQueue('u1')).toEqual([])
    enqueue('u1', { kind: 'delete', id: 'a' })
    expect(readQueue('u1')).toHaveLength(1)
  })
})

describe('applyPendingOps', () => {
  it('layers pending changes over the remote list', () => {
    const remote = [habit('a', 0), habit('b', 1)]
    const merged = applyPendingOps(remote, [
      { kind: 'delete', id: 'a' },
      { kind: 'upsert', habit: habit('c', 2), isNew: true },
      { kind: 'upsert', habit: habit('b', 5, 'edited'), isNew: false },
    ])
    expect(merged.map((h) => [h.id, h.text])).toEqual([
      ['c', 'C'],
      ['b', 'edited'],
    ])
  })
})

describe('isPermanentSyncError', () => {
  it('treats network failures and missing codes as transient', () => {
    expect(isPermanentSyncError(networkError())).toBe(false)
    expect(isPermanentSyncError(new Error('boom'))).toBe(false)
    expect(isPermanentSyncError({ code: '08006' })).toBe(false)
  })

  it('treats data and permission errors as permanent', () => {
    expect(isPermanentSyncError({ code: '23502' })).toBe(true)
    expect(isPermanentSyncError({ code: '42501' })).toBe(true)
    expect(isPermanentSyncError({ code: 'PGRST116' })).toBe(true)
  })
})

describe('flushQueue', () => {
  const makeApi = (): RemoteHabitsApi & { upserted: Habit[][]; deleted: string[][] } => {
    const api = {
      upserted: [] as Habit[][],
      deleted: [] as string[][],
      upsertMany: vi.fn(async (_userId: string, habits: Habit[]) => {
        api.upserted.push(habits)
      }),
      deleteMany: vi.fn(async (_userId: string, ids: string[]) => {
        api.deleted.push(ids)
      }),
    }
    return api
  }

  it('sends upserts and deletes in two batched requests and empties the queue', async () => {
    enqueue('u1', { kind: 'upsert', habit: habit('a', 0), isNew: true })
    enqueue('u1', { kind: 'upsert', habit: habit('b', 1), isNew: false })
    enqueue('u1', { kind: 'delete', id: 'z' })
    const api = makeApi()
    await expect(flushQueue('u1', api)).resolves.toEqual({ ok: true, dropped: 0 })
    expect(api.upserted).toEqual([[habit('a', 0), habit('b', 1)]])
    expect(api.deleted).toEqual([['z']])
    expect(readQueue('u1')).toEqual([])
  })

  it('keeps everything queued on a network failure', async () => {
    enqueue('u1', { kind: 'upsert', habit: habit('a', 0), isNew: true })
    const api = makeApi()
    api.upsertMany = vi.fn(async () => {
      throw networkError()
    })
    await expect(flushQueue('u1', api)).resolves.toMatchObject({ ok: false })
    expect(readQueue('u1')).toHaveLength(1)
  })

  it('drops only the row the server permanently rejects', async () => {
    enqueue('u1', { kind: 'upsert', habit: habit('good', 0), isNew: true })
    enqueue('u1', { kind: 'upsert', habit: habit('bad', 1), isNew: true })
    const api = makeApi()
    api.upsertMany = vi.fn(async (_userId: string, habits: Habit[]) => {
      if (habits.some((h) => h.id === 'bad')) throw { code: '23502', message: 'null value' }
      api.upserted.push(habits)
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(flushQueue('u1', api)).resolves.toEqual({ ok: true, dropped: 1 })
    expect(api.upserted).toEqual([[habit('good', 0)]])
    expect(readQueue('u1')).toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it('keeps a change made while its previous version was being sent', async () => {
    enqueue('u1', { kind: 'upsert', habit: habit('a', 0, 'v1'), isNew: true })
    const api = makeApi()
    api.upsertMany = vi.fn(async () => {
      enqueue('u1', { kind: 'upsert', habit: habit('a', 0, 'v2'), isNew: false })
    })
    await flushQueue('u1', api)
    expect(readQueue('u1')).toEqual([{ kind: 'upsert', habit: habit('a', 0, 'v2'), isNew: false }])
  })

  it('still deletes on the server when an item is deleted while its creation is in flight', async () => {
    enqueue('u1', { kind: 'upsert', habit: habit('a', 0), isNew: true })
    const api = makeApi()
    api.upsertMany = vi.fn(async () => {
      enqueue('u1', { kind: 'delete', id: 'a' })
    })
    await flushQueue('u1', api)
    expect(readQueue('u1')).toEqual([{ kind: 'delete', id: 'a' }])
  })
})
