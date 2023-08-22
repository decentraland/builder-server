import {
  collectionFragmentMock,
  dbCollectionMock,
} from '../../spec/mocks/collections'
import { dbItemMock, itemFragmentMock } from '../../spec/mocks/items'
import { wearableMock } from '../../spec/mocks/peer'
import { Collection } from '../Collection/Collection.model'
import { Bridge } from '../ethereum/api/Bridge'
import { collectionAPI } from '../ethereum/api/collection'
import { peerAPI } from '../ethereum/api/peer'
import { UnauthorizedToUpsertError } from './Item.errors'
import { Item } from './Item.model'
import { ItemService } from './Item.service'
import { ItemAttributes } from './Item.types'
import { VIDEO_PATH } from './utils'

jest.mock('../ethereum/api/collection')
jest.mock('../Collection/Collection.model')
jest.mock('../ethereum/api/peer')
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
            updated_at: expect.anything(),
          })
        })
      })

      describe('and the previous owner tries to upsert an item', () => {
        it('should throw unauthorized', async () => {
          expect(() =>
            service.upsertItem(Bridge.toFullItem(dbItem), oldCreatorAddress)
          ).rejects.toThrow(UnauthorizedToUpsertError)
        })
      })
    })

    describe('when the collection db is published', () => {
      describe('and the collection contains smart wearables', () => {
        beforeEach(() => {
          oldCreatorAddress = '0xoldCreator'
          const dbCollection = {
            ...dbCollectionMock,
            eth_address: oldCreatorAddress,
          }
          dbItem = {
            ...dbItemMock,
            eth_address: oldCreatorAddress,
            contents: {
              ...dbItemMock.contents,
              'male/game.js': 'hash1',
              [VIDEO_PATH]: 'videoHash2',
            },
            video: 'videoHash',
          }
          ;(Item.findOne as jest.Mock).mockRestore()
          ;(Item.findOne as jest.Mock).mockResolvedValueOnce(dbItem)
          ;(Item.hasPublishedItems as jest.Mock).mockResolvedValue(true)
          ;(Item.upsert as jest.Mock).mockImplementation((value) => value)
          ;(Collection.findByIds as jest.Mock).mockRestore()
          ;(Collection.findByIds as jest.Mock).mockImplementation((ids) =>
            [dbCollection].filter((collection) => ids.includes(collection.id))
          )
          ;(collectionAPI.fetchCollection as jest.Mock).mockRestore()
          ;(collectionAPI.fetchCollection as jest.Mock).mockImplementation(() =>
            Promise.resolve({
              ...collectionFragmentMock,
              creator: oldCreatorAddress,
            })
          )
        })

        it('should update the item without updating the video field', async () => {
          const item = {
            ...dbItem,
            video: 'videoHash2',
          }
          expect(
            await service.upsertItem(Bridge.toFullItem(item), item.eth_address)
          ).toEqual({
            ...Bridge.toFullItem(dbItem),
            local_content_hash: expect.any(String),
            updated_at: expect.anything(),
          })
        })
      })
    })
  })

  describe('getItemByContractAddressAndTokenId', () => {
    beforeEach(() => {
      dbItem = {
        ...dbItemMock,
        collection_id: dbCollectionMock.id,
        blockchain_item_id: '0',
      }
    })

    describe('when the item is found', () => {
      beforeEach(() => {
        ;(Item.findByBlockchainIdsAndContractAddresses as jest.Mock).mockResolvedValueOnce(
          [dbItem]
        )
        ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
          dbCollectionMock
        )
        ;(collectionAPI.fetchCollectionWithItem as jest.Mock).mockResolvedValueOnce(
          { collection: itemFragmentMock.collection, item: itemFragmentMock }
        )
        ;(peerAPI.fetchItems as jest.Mock).mockResolvedValueOnce([wearableMock])
      })

      it('should return the merged item', async () => {
        expect(
          service.getItemByContractAddressAndTokenId('0xa', '1')
        ).resolves.toEqual({
          item: Bridge.mergeItem(
            dbItem,
            itemFragmentMock,
            itemFragmentMock.collection,
            wearableMock
          ),
          collection: Bridge.mergeCollection(
            dbCollectionMock,
            itemFragmentMock.collection
          ),
        })
      })
    })

    describe('when the item is not found', () => {
      beforeEach(() => {
        ;(Item.findByBlockchainIdsAndContractAddresses as jest.Mock).mockResolvedValueOnce(
          []
        )
      })

      it('should throw a NonExistentItemError error with the collectionAddress and the blockchainId', async () => {
        expect(
          service.getItemByContractAddressAndTokenId('0xa', '1')
        ).rejects.toThrow("The item doesn't exist.")
      })
    })
  })

  describe('updateDCLItemsContent', () => {
    describe('when the collection contains smart wearables', () => {
      beforeEach(() => {
        dbItem = {
          ...dbItemMock,
          contents: {
            ...dbItemMock.contents,
            'male/game.js': 'hash1',
            [VIDEO_PATH]: 'videoHash',
          },
          video: 'videoHash',
        }
        ;(Item.upsert as jest.Mock).mockRestore()
        ;(Item.findByCollectionIds as jest.Mock).mockResolvedValueOnce([dbItem])
      })

      describe('and the item has an updated video', () => {
        beforeEach(() => {
          dbItem = {
            ...dbItem,
            video: '',
          }
          ;(Item.findByCollectionIds as jest.Mock).mockRestore()
          ;(Item.findByCollectionIds as jest.Mock).mockResolvedValueOnce([
            dbItem,
          ])
        })

        it('should update the item video with the new video content hash', async () => {
          const collectionId = 'collectionId'
          const updateSpy = jest.spyOn(Item, 'upsert').mockResolvedValue({
            ...dbItem,
            video: 'videoHash',
          })
          await service.updateDCLItemsContent(collectionId)
          expect(updateSpy).toHaveBeenCalledWith({
            ...dbItem,
            video: 'videoHash',
            updated_at: expect.anything(),
          })
        })
      })

      describe('and the item does not have an updated video', () => {
        it('should not update the item video', async () => {
          const collectionId = 'collectionId'
          const updateSpy = jest.spyOn(Item, 'upsert')
          await service.updateDCLItemsContent(collectionId)
          expect(updateSpy).not.toHaveBeenCalled()
        })
      })
    })

    describe('when the collection does not contain smart wearables', () => {
      beforeEach(() => {
        dbItem = { ...dbItemMock }
        ;(Item.upsert as jest.Mock).mockRestore()
        ;(Item.findByCollectionIds as jest.Mock).mockResolvedValueOnce([dbItem])
      })

      it('should not update the item', async () => {
        const collectionId = 'collectionId'
        const updateSpy = jest.spyOn(Item, 'upsert')
        await service.updateDCLItemsContent(collectionId)
        expect(updateSpy).not.toHaveBeenCalled()
      })
    })
  })
})
