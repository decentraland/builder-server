import { peerAPI } from './peer'

describe('when getting the profile name for an address', () => {
  const address = '0x1234567890abcdef1234567890abcdefa1b2c3d4'
  let fetchMock: jest.SpyInstance

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch')
  })

  afterEach(() => {
    fetchMock.mockRestore()
  })

  describe('and the profile has a claimed name', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce(({
        ok: true,
        json: async () => [
          { avatars: [{ name: 'Vitalik', hasClaimedName: true }] },
        ],
      } as unknown) as Response)
    })

    it('should return the claimed name', async () => {
      expect(await peerAPI.getProfileName(address)).toBe('Vitalik')
    })
  })

  describe('and the profile has an unclaimed name', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce(({
        ok: true,
        json: async () => [
          { avatars: [{ name: 'Vitalik', hasClaimedName: false }] },
        ],
      } as unknown) as Response)
    })

    it('should return undefined so the caller falls back to the address', async () => {
      expect(await peerAPI.getProfileName(address)).toBeUndefined()
    })
  })

  describe('and the profile has no name', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce(({
        ok: true,
        json: async () => [{ avatars: [{ hasClaimedName: true }] }],
      } as unknown) as Response)
    })

    it('should return undefined', async () => {
      expect(await peerAPI.getProfileName(address)).toBeUndefined()
    })
  })

  describe('and the request responds with a non-OK status', () => {
    let cancelBody: jest.Mock

    beforeEach(() => {
      cancelBody = jest.fn().mockResolvedValue(undefined)
      fetchMock.mockResolvedValueOnce(({
        ok: false,
        body: { cancel: cancelBody },
      } as unknown) as Response)
    })

    it('should return undefined', async () => {
      expect(await peerAPI.getProfileName(address)).toBeUndefined()
    })

    it('should release the response body', async () => {
      await peerAPI.getProfileName(address)
      expect(cancelBody).toHaveBeenCalled()
    })
  })

  describe('and the request does not respond before the timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers()
      fetchMock.mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(new Error('aborted'))
            )
          })
      )
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should abort the request and return undefined', async () => {
      const profileName = peerAPI.getProfileName(address)
      jest.advanceTimersByTime(10000)
      expect(await profileName).toBeUndefined()
    })
  })

  describe('and the fetch is aborted or fails', () => {
    beforeEach(() => {
      fetchMock.mockRejectedValueOnce(new Error('aborted'))
    })

    it('should return undefined', async () => {
      expect(await peerAPI.getProfileName(address)).toBeUndefined()
    })
  })
})
