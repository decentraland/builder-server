import { MappingType } from '@dcl/schemas'
import {
  dbCollectionMock,
  dbTPCollectionMock,
} from '../../spec/mocks/collections'
import {
  dbItemMock,
  dbTPItemMock,
  itemFragmentMock,
} from '../../spec/mocks/items'
import { wearableMock } from '../../spec/mocks/peer'
import { mockOwnableCanUpsert } from '../../spec/utils'
import { CollectionAttributes } from '../Collection'
import { Collection } from '../Collection/Collection.model'
import { CollectionService } from '../Collection/Collection.service'
import { Bridge } from '../ethereum/api/Bridge'
import { collectionAPI } from '../ethereum/api/collection'
import { peerAPI } from '../ethereum/api/peer'
import {
  ItemCantBeMovedFromCollectionError,
  MappingNotAllowedError,
  MaximunAmountOfTagsReachedError,
  RequiresMappingsError,
  ThirdPartyItemInsertByURNError,
} from './Item.errors'
import { Item, MAX_TAGS_LENGTH } from './Item.model'
import { ItemService } from './Item.service'
import { ItemAttributes } from './Item.types'
import { VIDEO_PATH } from './utils'

jest.mock('../ethereum/api/collection')
jest.mock('../Collection/Collection.model')
jest.mock('../ethereum/api/peer')
jest.mock('./Item.model')

describe('Item Service', () => {
  let dbItem: ItemAttributes
  let dbTPItem: ItemAttributes
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
    describe('and the item is being moved from a TP collection to a DCL collection', () => {
      beforeEach(() => {
        dbItem = { ...dbItemMock, collection_id: dbCollectionMock.id }
        dbTPItem = { ...dbItemMock, collection_id: dbTPCollectionMock.id }
        ;(Item.findOne as jest.Mock).mockResolvedValueOnce(dbItem)
        ;(Collection.findByIds as jest.Mock).mockImplementation((ids) =>
          [dbCollectionMock, dbTPCollectionMock].filter((collection) =>
            ids.includes(collection.id)
          )
        )
      })

      it('should throw the ItemCantBeMovedFromCollectionError error', () => {
        return expect(
          service.upsertItem(
            Bridge.toFullItem(dbTPItem, dbTPCollectionMock),
            '0xnewCreator'
          )
        ).rejects.toThrowError(ItemCantBeMovedFromCollectionError)
      })
    })

    describe('and the item is being moved from a DCL collection to a TP collection', () => {
      beforeEach(() => {
        dbItem = { ...dbItemMock, collection_id: dbCollectionMock.id }
        dbTPItem = { ...dbItemMock, collection_id: dbTPCollectionMock.id }
        ;(Item.findOne as jest.Mock).mockResolvedValueOnce(dbTPItem)
        ;(Collection.findByIds as jest.Mock).mockImplementation((ids) =>
          [dbCollectionMock, dbTPCollectionMock].filter((collection) =>
            ids.includes(collection.id)
          )
        )
      })

      it('should throw the ItemCantBeMovedFromCollectionError error', () => {
        return expect(
          service.upsertItem(Bridge.toFullItem(dbItem), '0xnewCreator')
        ).rejects.toThrowError(ItemCantBeMovedFromCollectionError)
      })
    })

    describe('and the item being inserted only contains a URN', () => {
      beforeEach(() => {
        dbTPItem = { ...dbTPItemMock, id: null as any }
        ;(Item.findByURNSuffix as jest.Mock).mockResolvedValueOnce(undefined)
      })

      it('should throw the ThirdPartyItemInsertByURNError error', () => {
        return expect(
          service.upsertItem(
            Bridge.toFullItem(dbTPItem, dbTPCollectionMock),
            '0xnewCreator'
          )
        ).rejects.toThrowError(ThirdPartyItemInsertByURNError)
      })
    })

    describe('and the item being upserted contains tags', () => {
      beforeEach(() => {
        CollectionService.prototype.getDBCollection = jest.fn()
      })
      describe('and it is an insert operation', () => {
        beforeEach(() => {
          ;(Item.findByURNSuffix as jest.Mock).mockResolvedValueOnce(undefined)
        })
        describe('and it is inserting less than the maximun amount of tags', () => {
          beforeEach(() => {
            dbItem = {
              ...dbItemMock,
              eth_address: '0xAddress',
              data: {
                ...dbItemMock.data,
                tags: Array(MAX_TAGS_LENGTH - 1).fill('tag'),
              },
            }
            dbCollectionMock.eth_address = dbItem.eth_address
            mockOwnableCanUpsert(Item, dbItem.id, dbItem.eth_address, true)
            mockOwnableCanUpsert(
              Collection,
              dbCollectionMock.id,
              dbItem.eth_address,
              true
            )
            ;(CollectionService.prototype
              .getDBCollection as jest.Mock).mockResolvedValueOnce(
              dbCollectionMock
            )
            ;(Item.upsert as jest.Mock).mockResolvedValueOnce(dbItem)
            CollectionService.prototype.isDCLPublished = jest.fn()
          })
          it('should not throw any errors and return the inserted item', () => {
            const result = service.upsertItem(
              Bridge.toFullItem(dbItem, dbTPCollectionMock),
              dbItem.eth_address
            )
            return expect(result).resolves.toEqual(
              Bridge.toFullItem(dbItem, dbCollectionMock)
            )
          })
        })

        describe('and it is inserting more than the maximun amount of tags', () => {
          beforeEach(() => {
            dbItem = {
              ...dbItemMock,
              data: {
                ...dbItemMock.data,
                tags: Array(MAX_TAGS_LENGTH + 1).fill('tag'),
              },
            }
          })
          it('should throw the MaximunAmountOfTagsReachedError error', () => {
            return expect(
              service.upsertItem(
                Bridge.toFullItem(dbItem, dbTPCollectionMock),
                dbItem.eth_address
              )
            ).rejects.toThrowError(MaximunAmountOfTagsReachedError)
          })
        })
      })

      describe('and it is an update operation', () => {
        beforeEach(() => {
          ;(Item.findByURNSuffix as jest.Mock).mockResolvedValueOnce(dbItem)
        })
        describe('and the item already has the maximun amount of tags', () => {
          it('should throw the MaximunAmountOfTagsReachedError error', () => {
            return expect(
              service.upsertItem(
                Bridge.toFullItem(dbItem, dbTPCollectionMock),
                dbItem.eth_address
              )
            ).rejects.toThrowError(MaximunAmountOfTagsReachedError)
          })
        })

        describe('and the item has less than the maximun amount of tags', () => {
          beforeEach(() => {
            dbItem = {
              ...dbItemMock,
              eth_address: '0xAddress',
              data: {
                ...dbItemMock.data,
                tags: Array(MAX_TAGS_LENGTH - 1).fill('tag'),
              },
            }
            dbCollectionMock.eth_address = dbItem.eth_address
            mockOwnableCanUpsert(Item, dbItem.id, dbItem.eth_address, true)
            mockOwnableCanUpsert(
              Collection,
              dbCollectionMock.id,
              dbItem.eth_address,
              true
            )
            ;(CollectionService.prototype
              .getDBCollection as jest.Mock).mockResolvedValueOnce(
              dbCollectionMock
            )
            ;(Item.upsert as jest.Mock).mockResolvedValueOnce(dbItem)
          })
          it('should not throw any error and return the inserted item', () => {
            const result = service.upsertItem(
              Bridge.toFullItem(dbItem, dbTPCollectionMock),
              dbItem.eth_address
            )
            return expect(result).resolves.toEqual(
              Bridge.toFullItem(dbItem, dbCollectionMock)
            )
          })
        })
      })
    })

    describe('and the item being upserted is a TP V2 item without a mapping', () => {
      let tpCollectionMock: CollectionAttributes
      let tpItemMock: ItemAttributes

      beforeEach(() => {
        tpCollectionMock = {
          ...dbTPCollectionMock,
          third_party_id:
            'urn:decentraland:matic:collections-linked-wearables:aThirdParty',
          urn_suffix: 'amoy:0x74c78f5A4ab22F01d5fd08455cf0Ff5C3367535C',
        }
        tpItemMock = {
          ...dbTPItemMock,
          urn_suffix: '1',
          mappings: null,
        }
        ;(Item.findByURNSuffix as jest.Mock).mockResolvedValueOnce(undefined)
        ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
          tpCollectionMock,
        ])
      })

      it('should throw the requires mapping error', () => {
        return expect(
          service.upsertItem(
            Bridge.toFullItem(tpItemMock, tpCollectionMock),
            tpItemMock.eth_address
          )
        ).rejects.toThrowError(RequiresMappingsError)
      })
    })

    describe('and the item being upserted is a TP V1 item with a mapping', () => {
      let tpCollectionMock: CollectionAttributes
      let tpItemMock: ItemAttributes

      beforeEach(() => {
        tpCollectionMock = {
          ...dbTPCollectionMock,
        }
        tpItemMock = {
          ...dbTPItemMock,
          mappings: [{ type: MappingType.ANY }],
        }
        ;(Item.findByURNSuffix as jest.Mock).mockResolvedValueOnce(undefined)
        ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
          tpCollectionMock,
        ])
      })

      it('should throw the mapping not allowed error', () => {
        return expect(
          service.upsertItem(
            Bridge.toFullItem(tpItemMock, tpCollectionMock),
            tpItemMock.eth_address
          )
        ).rejects.toThrowError(MappingNotAllowedError)
      })
    })
  })

  describe('when getting an item utility by its contract address and blockchain item id', () => {
    beforeEach(() => {
      dbItem = {
        ...dbItemMock,
        collection_id: dbCollectionMock.id,
        utility: 'utility',
      }
    })

    describe('when the item is not found', () => {
      beforeEach(() => {
        ;(Item.findByBlockchainIdsAndContractAddresses as jest.Mock).mockResolvedValueOnce(
          []
        )
      })

      it('should throw a NonExistentItemError error with the collectionAddress and the blockchainId', () => {
        return expect(
          service.getItemByContractAddressAndTokenId('0xa', '1')
        ).rejects.toThrow("The item doesn't exist.")
      })
    })

    describe('when the item is found', () => {
      beforeEach(() => {
        ;(Item.findByBlockchainIdsAndContractAddresses as jest.Mock).mockResolvedValueOnce(
          [dbItem]
        )
      })

      it('should return the utility', () => {
        return expect(
          service.getItemUtilityByContractAddressAndTokenId('0xa', '1')
        ).resolves.toEqual('utility')
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

      it('should return the merged item', () => {
        return expect(
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

      it('should throw a NonExistentItemError error with the collectionAddress and the blockchainId', () => {
        return expect(
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
