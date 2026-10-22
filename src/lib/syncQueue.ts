import type { Habit } from '@/types'

/**
 * Pending remote changes, persisted in localStorage per user.
 * One op per habit id: later changes replace earlier ones, so the queue never grows beyond the list size.
 */
export type SyncOp =
  | { kind: 'upsert'; habit: Habit; isNew: boolean }
  | { kind: 'delete'; id: string }

type QueueFile = Record<string, SyncOp[]>

export const SYNC_QUEUE_KEY = 'habitglo-sync-queue-v1'

export type RemoteHabitsApi = {
  upsertMany: (userId: string, habits: Habit[]) => Promise<void>
  deleteMany: (userId: string, ids: string[]) => Promise<void>
}

const opId = (op: SyncOp) => (op.kind === 'upsert' ? op.habit.id : op.id)

const readFile = (storage: Storage): QueueFile => {
  try {
    const raw = storage.getItem(SYNC_QUEUE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as QueueFile) : {}
  } catch {
    return {}
  }
}

const writeFile = (storage: Storage, file: QueueFile) => {
  try {
    const cleaned = Object.fromEntries(Object.entries(file).filter(([, ops]) => ops.length > 0))
    if (Object.keys(cleaned).length === 0) storage.removeItem(SYNC_QUEUE_KEY)
    else storage.setItem(SYNC_QUEUE_KEY, JSON.stringify(cleaned))
  } catch (err) {
    console.warn('Failed to save pending sync changes:', err)
  }
}

export const readQueue = (userId: string, storage: Storage = window.localStorage): SyncOp[] => {
  const ops = readFile(storage)[userId]
  return Array.isArray(ops) ? ops : []
}

const writeQueue = (userId: string, ops: SyncOp[], storage: Storage) => {
  const file = readFile(storage)
  file[userId] = ops
  writeFile(storage, file)
}

export const enqueue = (userId: string, op: SyncOp, storage: Storage = window.localStorage) => {
  const ops = readQueue(userId, storage)
  const id = opId(op)
  const index = ops.findIndex((existing) => opId(existing) === id)
  const existing = index >= 0 ? ops[index] : null

  if (op.kind === 'delete') {
    if (existing?.kind === 'upsert' && existing.isNew) {
      // Never reached the server: nothing to delete remotely.
      ops.splice(index, 1)
    } else if (index >= 0) {
      ops[index] = op
    } else {
      ops.push(op)
    }
  } else {
    const isNew = op.isNew || (existing?.kind === 'upsert' && existing.isNew)
    const next: SyncOp = { kind: 'upsert', habit: op.habit, isNew }
    if (index >= 0) ops[index] = next
    else ops.push(next)
  }
  writeQueue(userId, ops, storage)
}

export const clearQueue = (userId: string, storage: Storage = window.localStorage) => {
  writeQueue(userId, [], storage)
}

/** Applies still-pending local changes on top of a fresh remote list so unsynced edits never flicker away. */
export const applyPendingOps = (remote: Habit[], ops: SyncOp[]): Habit[] => {
  const byId = new Map(remote.map((habit) => [habit.id, habit] as const))
  for (const op of ops) {
    if (op.kind === 'delete') byId.delete(op.id)
    else byId.set(op.habit.id, op.habit)
  }
  return [...byId.values()].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
}

/** Errors the server will keep returning no matter how often we retry (bad data, permission denied). */
export const isPermanentSyncError = (err: unknown): boolean => {
  const code = (err as { code?: unknown } | null)?.code
  if (typeof code !== 'string' || code.length === 0) return false
  if (/^PGRST1\d\d$/.test(code)) return true
  if (/^[0-9A-Z]{5}$/.test(code)) {
    // Connection, resource, operator-intervention and rollback classes are transient.
    return !['08', '40', '53', '57', '58'].includes(code.slice(0, 2))
  }
  return false
}

export type FlushResult = { ok: boolean; dropped: number }

const sameOp = (a: SyncOp | undefined, b: SyncOp) => !!a && JSON.stringify(a) === JSON.stringify(b)

/**
 * Pushes the user's pending ops to the server. Successful ops are removed; ops changed while in flight
 * stay queued (with the newer value). Transient failures stop the flush and keep everything queued.
 */
export const flushQueue = async (
  userId: string,
  api: RemoteHabitsApi,
  storage: Storage = window.localStorage,
): Promise<FlushResult> => {
  const snapshot = readQueue(userId, storage)
  if (snapshot.length === 0) return { ok: true, dropped: 0 }

  // Mark upserts as no longer new before sending: if a delete arrives mid-flight, it must reach the server.
  const sending = snapshot.map((op) => (op.kind === 'upsert' ? { ...op, isNew: false } : op))
  writeQueue(
    userId,
    readQueue(userId, storage).map((op) => (op.kind === 'upsert' ? { ...op, isNew: false } : op)),
    storage,
  )

  const settle = (done: SyncOp[]) => {
    const current = readQueue(userId, storage)
    writeQueue(
      userId,
      current.filter((op) => !done.some((d) => opId(d) === opId(op) && sameOp(op, d))),
      storage,
    )
  }

  const upserts = sending.filter((op): op is Extract<SyncOp, { kind: 'upsert' }> => op.kind === 'upsert')
  const deletes = sending.filter((op): op is Extract<SyncOp, { kind: 'delete' }> => op.kind === 'delete')
  let dropped = 0

  const runBatch = async (batch: SyncOp[], send: () => Promise<void>, sendOne: (op: SyncOp) => Promise<void>) => {
    if (batch.length === 0) return true
    try {
      await send()
      settle(batch)
      return true
    } catch (err) {
      if (!isPermanentSyncError(err)) return false
    }
    // A permanent error in a batch: retry one by one so a single bad row cannot block the rest.
    for (const op of batch) {
      try {
        await sendOne(op)
        settle([op])
      } catch (err) {
        if (!isPermanentSyncError(err)) return false
        console.warn('Dropping a change the server rejected:', err)
        dropped += 1
        settle([op])
      }
    }
    return true
  }

  const upsertsOk = await runBatch(
    upserts,
    () => api.upsertMany(userId, upserts.map((op) => op.habit)),
    (op) => api.upsertMany(userId, [(op as Extract<SyncOp, { kind: 'upsert' }>).habit]),
  )
  if (!upsertsOk) return { ok: false, dropped }

  const deletesOk = await runBatch(
    deletes,
    () => api.deleteMany(userId, deletes.map((op) => op.id)),
    (op) => api.deleteMany(userId, [(op as Extract<SyncOp, { kind: 'delete' }>).id]),
  )
  return { ok: deletesOk, dropped }
}
