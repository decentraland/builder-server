import fetch from 'node-fetch'

const REQUEST_TIMEOUT_MS = 5 * 1000

/** `FF_<FLAG>=true|false` in the environment wins over the remote flag, so local and test setups do not depend on the public flag service. */
const localOverride = (featureFlag: string): boolean | undefined => {
  const value = process.env[`FF_${featureFlag.toUpperCase().replace(/-/g, '_')}`]
  return value === 'true' ? true : value === 'false' ? false : undefined
}

export const isFeatureFlagEnabled = async (featureFlag: string) => {
  const override = localOverride(featureFlag)
  if (override !== undefined) {
    return override
  }

  let isFeatureFlagEnabled = false

  try {
    const response = await fetch(
      // TODO: Provide via env?
      // TODO: Abstract this to be able to use a generic feature flag solution in servers.
      'https://feature-flags.decentraland.org/builder.json',
      { timeout: REQUEST_TIMEOUT_MS }
    )

    const json = await response.json()

    isFeatureFlagEnabled = json.flags[`builder-${featureFlag}`]
  } catch (e) {
    console.warn('Error fetching feature flags', (e as Error).message)
  }

  return isFeatureFlagEnabled
}
