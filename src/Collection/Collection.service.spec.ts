import { v4 as uuidv4 } from 'uuid'
import { Collection } from './Collection.model'
import { CollectionService } from './Collection.service'
import { wallet } from '../../spec/utils'

jest.mock('./Collection.model')

describe('Collection service', () => {
  describe('#isLocked', () => {
    const collectionAttributes = {
      id: uuidv4(),
      name: 'Test',
      eth_address: wallet.address,
      salt: '',
      contract_address: '0x2a8fd99c19271f4f04b1b7b9c4f7cf264b626edb',
      is_published: false,
      is_approved: false,
      minters: [],
      managers: [],
      forum_link: null,
      lock: null,
      reviewed_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    }

    const service = new CollectionService()
    const findOneMock = Collection.findOne as jest.Mock
    const isPublishedMock = jest.spyOn(service, 'isPublished')

    const twoDaysInMilliseconds = 2 * 24 * 60 * 60 * 1000

    beforeEach(() => {
      findOneMock.mockRestore()
    })

    describe("when the collection doesn't exists", () => {
      beforeEach(() => {
        findOneMock.mockImplementationOnce((collectionId: string) => {
          if (collectionAttributes.id === collectionId) {
            return undefined
          }
          throw new Error('Invalid id')
        })
      })
      it('should return false', async () => {
        expect(await service.isLocked(collectionAttributes.id)).toBe(false)
      })
    })

    describe('when the collection does not have a lock set', () => {
      beforeEach(() => {
        findOneMock.mockImplementationOnce((collectionId: string) =>
          collectionAttributes.id === collectionId
            ? collectionAttributes
            : undefined
        )
      })
      it('should return false', async () => {
        expect(await service.isLocked(collectionAttributes.id)).toBe(false)
      })
    })

    describe('when the collection is correctly locked', () => {
      let lock: Date

      beforeEach(() => {
        lock = new Date()
        findOneMock.mockImplementationOnce((collectionId: string) =>
          collectionAttributes.id === collectionId
            ? { ...collectionAttributes, lock }
            : undefined
        )
      })
      it('should return false if the lock date + 1 day is newer than now', async () => {
        jest
          .spyOn(Date, 'now')
          .mockReturnValueOnce(Date.now() + twoDaysInMilliseconds)

        expect(await service.isLocked(collectionAttributes.id)).toBe(false)
      })

      describe('and is published', () => {
        beforeEach(() => {
          isPublishedMock.mockReturnValueOnce(Promise.resolve(true))
        })
        it('should return false if the lock date + 1 day is older than now', async () => {
          expect(await service.isLocked(collectionAttributes.id)).toBe(false)
        })
      })

      describe('and is not published', () => {
        beforeEach(() => {
          isPublishedMock.mockReturnValueOnce(Promise.resolve(false))
        })

        it('should return true if the lock date + 1 day is older than now', async () => {
          expect(await service.isLocked(collectionAttributes.id)).toBe(true)
        })
      })
    })
  })
})
