import { v4 as uuidv4 } from 'uuid'
import { Collection } from './Collection.model'
import { CollectionService } from './Collection.service'
import { wallet } from '../../spec/utils'

jest.mock('./Collection.model')

describe.only('Collection service', () => {
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

    it('should return false if the collection does not exist', async () => {
      findOneMock.mockImplementationOnce((collectionId: string) => {
        if (collectionAttributes.id === collectionId) {
          return undefined
        }
        throw new Error('Invalid id')
      })
      expect(await service.isLocked(collectionAttributes.id)).toBe(false)
    })

    it('should return false if the collection does not have a lock set', async () => {
      findOneMock.mockImplementationOnce((collectionId: string) =>
        collectionAttributes.id === collectionId
          ? collectionAttributes
          : undefined
      )
      expect(await service.isLocked(collectionAttributes.id)).toBe(false)
    })

    it('should return false if the lock date + 1 day is newer than now', async () => {
      const lock = new Date()
      jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(Date.now() + twoDaysInMilliseconds)

      findOneMock.mockImplementationOnce((collectionId: string) =>
        collectionAttributes.id === collectionId
          ? { ...collectionAttributes, lock }
          : undefined
      )
      expect(await service.isLocked(collectionAttributes.id)).toBe(false)
    })

    it('should return false if the lock date + 1 day is older than now but the collection is published', async () => {
      const lock = new Date()

      isPublishedMock.mockReturnValueOnce(Promise.resolve(true))

      findOneMock.mockImplementationOnce((collectionId: string) =>
        collectionAttributes.id === collectionId
          ? { ...collectionAttributes, lock }
          : undefined
      )
      expect(await service.isLocked(collectionAttributes.id)).toBe(false)
    })

    it('should return true if the lock date + 1 day is older than now and the collection is not published', async () => {
      const lock = new Date()

      isPublishedMock.mockReturnValueOnce(Promise.resolve(false))

      findOneMock.mockImplementationOnce((collectionId: string) =>
        collectionAttributes.id === collectionId
          ? { ...collectionAttributes, lock }
          : undefined
      )
      expect(await service.isLocked(collectionAttributes.id)).toBe(true)
    })
  })
})
