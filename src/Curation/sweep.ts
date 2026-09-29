import { db } from '../database'
import { AutoCurationService } from './AutoCuration.service'

export const SWEEP_INTERVAL_MS = 10 * 60 * 1000
// Session-level advisory lock so only one server instance runs the sweep at a time.
export const SWEEP_LOCK_KEY = 20260929

export async function runAutoCurationSweep(
  service: AutoCurationService
): Promise<boolean> {
  const [lock] = (await db.query('SELECT pg_try_advisory_lock($1) AS locked', [
    SWEEP_LOCK_KEY,
  ])) as { locked: boolean }[]
  if (!lock?.locked) {
    return false
  }

  try {
    await service.sweepStaleValidations()
  } finally {
    await db.query('SELECT pg_advisory_unlock($1)', [SWEEP_LOCK_KEY])
  }
  return true
}

export function startAutoCurationSweep(
  service = new AutoCurationService()
): NodeJS.Timeout {
  const timer = setInterval(() => {
    runAutoCurationSweep(service).catch((error: Error) => {
      console.error('Error sweeping stale validations', error.message)
    })
  }, SWEEP_INTERVAL_MS)
  timer.unref()
  return timer
}
