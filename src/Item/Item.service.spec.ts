import { dbCollectionMock } from '../../spec/mocks/collections'
import { dbItemMock, itemFragmentMock } from '../../spec/mocks/items'
import { Collection } from '../Collection/Collection.model'
import { Bridge } from '../ethereum/api/Bridge'
import { collectionAPI } from '../ethereum/api/collection'
import { UnauthorizedToUpsertError } from './Item.errors'
import { Item } from './Item.model'
import { ItemService } from './Item.service'
import { ItemAttributes } from './Item.types'

jest.mock('../ethereum/api/collection')
jest.mock('../Collection/Collection.model')
jest.mock('./Item.model')

describe('Item Service', () => {
  let dbItem: ItemAttributes
  let service: ItemService
  beforeEach(() => {
    service = new ItemService()
  })

  describe('isOwnedOrManagedBy', () => {
    describe('when the owner is the same as the one in the DB', () => {
      beforeEach(() => {
        dbItem = { ...dbItemMock, eth_address: '0xoriginalAddress' }
        ;(Item.findOne as jest.Mock).mockResolvedValueOnce(dbItem)
        ;(Collection.findOne as jest.Mock).mockResolvedValueOnce({
          ...dbCollectionMock,
          eth_address: '0xoriginalAddress',
        })
      })

      it('should return true', async () => {
        expect(
          await service.isOwnedOrManagedBy(dbItem.id, '0xoriginalAddress')
        ).toBe(true)
      })
    })

    describe('when the owner is not the same as the one in the DB', () => {
      beforeEach(() => {
        dbItem = { ...dbItemMock, eth_address: '0xanotherAddress' }
        ;(Item.findOne as jest.Mock).mockResolvedValueOnce(dbItem)
      })

      it('should return false', async () => {
        expect(
          await service.isOwnedOrManagedBy(dbItem.id, '0xoriginalAddress')
        ).toBe(false)
      })
    })
  })

  describe('upsertItem', () => {
    let newCreatorAddress: string
    let oldCreatorAddress: string

    describe('when the collection db eth_address is not the same as the collectionApi creator', () => {
      beforeEach(() => {
        newCreatorAddress = '0xnewCreator'
        oldCreatorAddress = '0xoldCreator'
        dbItem = { ...dbItemMock, eth_address: oldCreatorAddress }
        ;(Item.findOne as jest.Mock).mockResolvedValueOnce(dbItem)
        ;(Item.hasPublishedItems as jest.Mock).mockResolvedValue(true)
        ;(Item.upsert as jest.Mock).mockImplementation((value) => value)
        ;(Collection.findByIds as jest.Mock).mockImplementation((ids) =>
          [dbCollectionMock].filter((collection) => ids.includes(collection.id))
        )
        ;(collectionAPI.fetchCollection as jest.Mock).mockReset()
        ;(collectionAPI.fetchCollection as jest.Mock).mockImplementation(() =>
          Promise.resolve({ ...itemFragmentMock, creator: newCreatorAddress })
        )
      })

      describe('and the creator tries to upsert an item', () => {
        it('should return item information', async () => {
          expect(
            await service.upsertItem(
              Bridge.toFullItem(dbItem),
              newCreatorAddress
            )
          ).toEqual({
            ...Bridge.toFullItem(dbItem),
            local_content_hash: expect.any(String),
            updated_at: expect.anything()
          })
        })
      })

      describe('and the previous owner tries to upsert an item', () => {
        it('should throw unauthorized', async () => {
          expect(
            () => service.upsertItem(
              Bridge.toFullItem(dbItem),
              oldCreatorAddress
            ) 
          ).rejects.toThrow(UnauthorizedToUpsertError)
        })
      })
    })
  })
})
