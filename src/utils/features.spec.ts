import fetch from 'node-fetch'
import { isFeatureFlagEnabled, resetFeatureFlagsCache } from './features'

jest.mock('node-fetch')

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

describe('when checking a feature flag against the remote service', () => {
  const fetchMock = fetch as jest.MockedFunction<typeof fetch>
  const respondWith = (flags: Record<string, boolean>) =>
    fetchMock.mockResolvedValueOnce({
      json: () => Promise.resolve({ flags }),
    } as any)

  beforeEach(() => {
    resetFeatureFlagsCache()
    fetchMock.mockReset()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should fetch the flags once while the cache is fresh', async () => {
    respondWith({ 'builder-auto-curation': true })
    expect(await isFeatureFlagEnabled('auto-curation')).toBe(true)
    expect(await isFeatureFlagEnabled('auto-curation')).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('should keep the last known value when a refresh fails', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(0)
    respondWith({ 'builder-auto-curation': true })
    expect(await isFeatureFlagEnabled('auto-curation')).toBe(true)

    now.mockReturnValue(61 * 1000)
    fetchMock.mockRejectedValueOnce(new Error('timeout'))
    expect(await isFeatureFlagEnabled('auto-curation')).toBe(true)
  })

  it('should keep the last known value when the response carries no flags', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(0)
    respondWith({ 'builder-auto-curation': true })
    expect(await isFeatureFlagEnabled('auto-curation')).toBe(true)

    now.mockReturnValue(61 * 1000)
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve({ error: 'maintenance' }),
    } as any)
    expect(await isFeatureFlagEnabled('auto-curation')).toBe(true)
  })

  it('should fetch again once the cache expires', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(0)
    respondWith({ 'builder-auto-curation': true })
    expect(await isFeatureFlagEnabled('auto-curation')).toBe(true)

    now.mockReturnValue(61 * 1000)
    respondWith({ 'builder-auto-curation': false })
    expect(await isFeatureFlagEnabled('auto-curation')).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('should return false when the flags were never fetched, without fetching again for one cache period', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(0)
    fetchMock.mockRejectedValueOnce(new Error('timeout'))
    expect(await isFeatureFlagEnabled('auto-curation')).toBe(false)

    now.mockReturnValue(30 * 1000)
    expect(await isFeatureFlagEnabled('auto-curation')).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
