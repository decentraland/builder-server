import fetch from 'node-fetch'

export const isFeatureFlagEnabled = async (featureFlag: string) => {
  let isFeatureFlagEnabled = false

  try {
    const response = await fetch(
      // TODO: Provide via env?
      // TODO: Abstract this to be able to use a generic feature flag solution in servers.
      'https://feature-flags.decentraland.org/builder.json'
    )

    const json = await response.json()

    isFeatureFlagEnabled = json.flags[`builder-${featureFlag}`]
  } catch (e) {
    console.warn('Error fetching feature flags', (e as Error).message)
  }

  return isFeatureFlagEnabled
}
