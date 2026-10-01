import fetch from 'node-fetch'

const REQUEST_TIMEOUT_MS = 5 * 1000
const CACHE_TTL_MS = 60 * 1000

type FlagsSnapshot = { flags: Record<string, boolean>; fetchedAt: number }

let snapshot: FlagsSnapshot | undefined
let inFlight: Promise<FlagsSnapshot | undefined> | undefined

/** `FF_<FLAG>=true|false` in the environment wins over the remote flag, so local and test setups do not depend on the public flag service. */
const localOverride = (featureFlag: string): boolean | undefined => {
  const value =
    process.env[`FF_${featureFlag.toUpperCase().replace(/-/g, '_')}`]
  return value === 'true' ? true : value === 'false' ? false : undefined
}

async function fetchFlags(): Promise<FlagsSnapshot | undefined> {
  try {
    const response = await fetch(
      // TODO: Provide via env?
      // TODO: Abstract this to be able to use a generic feature flag solution in servers.
      'https://feature-flags.decentraland.org/builder.json',
      { timeout: REQUEST_TIMEOUT_MS }
    )
    const json = await response.json()
    snapshot = { flags: json.flags ?? {}, fetchedAt: Date.now() }
  } catch (e) {
    // The last known flags stay in use for another TTL: a failed fetch must not switch a flag off mid-flow.
    console.warn('Error fetching feature flags', (e as Error).message)
    if (snapshot) {
      snapshot = { ...snapshot, fetchedAt: Date.now() }
    }
  }
  return snapshot
}

export function resetFeatureFlagsCache(): void {
  snapshot = undefined
  inFlight = undefined
}

export const isFeatureFlagEnabled = async (featureFlag: string) => {
  const override = localOverride(featureFlag)
  if (override !== undefined) {
    return override
  }

  let current = snapshot
  if (!current || Date.now() - current.fetchedAt > CACHE_TTL_MS) {
    if (!inFlight) {
      inFlight = fetchFlags().finally(() => {
        inFlight = undefined
      })
    }
    current = await inFlight
  }

  return Boolean(current?.flags[`builder-${featureFlag}`])
}
