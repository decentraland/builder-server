import { AutoCurationService } from './AutoCuration.service'

export const SWEEP_INTERVAL_MS = 10 * 60 * 1000

export function startAutoCurationSweep(
  service = new AutoCurationService()
): NodeJS.Timeout {
  const timer = setInterval(() => {
    service.sweepStaleValidations().catch((error: Error) => {
      console.error('Error sweeping stale validations', error.message)
    })
  }, SWEEP_INTERVAL_MS)
  timer.unref()
  return timer
}
