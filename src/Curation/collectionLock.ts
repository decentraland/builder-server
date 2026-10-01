import { db } from '../database'
import { CollectionBusyError } from './AutoCuration.errors'

// Two-key advisory locks live apart from the sweep's single-key lock.
const LOCK_NAMESPACE = 20261001
const LOCK_ATTEMPTS = 20
const LOCK_RETRY_MS = 100

const collectionLocks = new Map<string, Promise<unknown>>()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function withAdvisoryLock<T>(
  collectionId: string,
  task: () => Promise<T>
): Promise<T> {
  // Every query shares one connection, so a blocking pg_advisory_lock would stall the whole process: poll instead.
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt++) {
    const [
      lock,
    ] = (await db.query(
      'SELECT pg_try_advisory_lock($1, hashtext($2)) AS locked',
      [LOCK_NAMESPACE, collectionId]
    )) as { locked: boolean }[]
    if (lock?.locked) {
      try {
        return await task()
      } finally {
        await db.query('SELECT pg_advisory_unlock($1, hashtext($2))', [
          LOCK_NAMESPACE,
          collectionId,
        ])
      }
    }
    await sleep(LOCK_RETRY_MS)
  }
  throw new CollectionBusyError(collectionId)
}

/**
 * Serializes the check-then-write flows of one collection: a promise chain within this process (session advisory
 * locks are re-entrant on the shared connection) and a Postgres advisory lock across instances.
 */
export async function withCollectionLock<T>(
  collectionId: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = collectionLocks.get(collectionId) ?? Promise.resolve()
  const current = previous
    .catch(() => undefined)
    .then(() => withAdvisoryLock(collectionId, task))
  collectionLocks.set(collectionId, current)
  try {
    return await current
  } finally {
    if (collectionLocks.get(collectionId) === current) {
      collectionLocks.delete(collectionId)
    }
  }
}
