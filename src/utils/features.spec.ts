import { isFeatureFlagEnabled } from './features'

describe('when checking a feature flag with a local override', () => {
  const variable = 'FF_AUTO_CURATION'

  afterEach(() => {
    delete process.env[variable]
  })

  it('should return true when the override is "true" without calling the remote service', async () => {
    process.env[variable] = 'true'
    expect(await isFeatureFlagEnabled('auto-curation')).toBe(true)
  })

  it('should return false when the override is "false"', async () => {
    process.env[variable] = 'false'
    expect(await isFeatureFlagEnabled('auto-curation')).toBe(false)
  })
})
