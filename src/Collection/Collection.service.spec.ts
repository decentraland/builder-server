import { CollectionService } from './Collection.service'

jest.mock('./Collection.model')

describe('Collection service', () => {
  describe('#isLockExpired', () => {
    const service = new CollectionService()

    const twoDaysInMilliseconds = 2 * 24 * 60 * 60 * 1000

    describe('when the collection does not have a lock set', () => {
      it('should return false', async () => {
        expect(await service.isLockExpired(undefined)).toBe(false)
      })
    })

    describe('when the collection is correctly locked', () => {
      let lock = new Date()

      it('should return false if the lock date + 1 day is newer than now', async () => {
        jest
          .spyOn(Date, 'now')
          .mockReturnValueOnce(Date.now() + twoDaysInMilliseconds)

        expect(await service.isLockExpired(lock)).toBe(false)
      })
    })
  })
})
