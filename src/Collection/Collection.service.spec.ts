import { CollectionService } from './Collection.service'

jest.mock('./Collection.model')

describe('Collection service', () => {
  describe('#isLockExpired', () => {
    const service = new CollectionService()

    const twoDaysInMilliseconds = 2 * 24 * 60 * 60 * 1000
    const thrityMinutesInMilliseconds = 30 * 60 * 1000

    describe('when the collection does not have a lock set', () => {
      it('should return false', async () => {
        expect(await service.isLockExpired(undefined)).toBe(false)
      })
    })

    describe('when the collection is locked with a date older than a day', () => {
      let lock: Date

      beforeEach(() => {
        lock = new Date()
        jest
          .spyOn(Date, 'now')
          .mockReturnValueOnce(Date.now() + twoDaysInMilliseconds)
      })

      afterAll(() => {
        // Just in case something goes wrong with the test and the Date.now function never gets executed.
        jest.restoreAllMocks()
      })

      it('should return false', async () => {
        expect(await service.isLockExpired(lock)).toBe(false)
      })
    })

    describe('when the collection is locked with a date sooner than a day', () => {
      let lock: Date

      beforeEach(() => {
        lock = new Date(Date.now() + thrityMinutesInMilliseconds)
      })

      it('should return true', async () => {
        expect(await service.isLockExpired(lock)).toBe(true)
      })
    })
  })
})
