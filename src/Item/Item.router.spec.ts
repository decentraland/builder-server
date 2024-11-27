import {
  ContractNetwork,
  MappingType,
  Rarity,
  ThirdPartyProps,
  Wearable,
} from '@dcl/schemas'
import supertest from 'supertest'
import { v4 as uuidv4 } from 'uuid'
import { ethers, Wallet } from 'ethers'
import { utils } from 'decentraland-commons'
import { omit } from 'decentraland-commons/dist/utils'
import {
  createAuthHeaders,
  buildURL,
  mockExistsMiddleware,
  mockOwnableCanUpsert,
  mockItemAuthorizationMiddleware,
  mockIsCollectionPublished,
  mockIsThirdPartyManager,
  mockThirdPartyItemCurationExists,
  mockThirdPartyURNExists,
  isoDateStringMatcher,
  mockFetchCollectionWithItem,
  mockFetchCatalystItems,
} from '../../spec/utils'
import {
  dbCollectionMock,
  dbTPCollectionMock,
  thirdPartyFragmentMock,
} from '../../spec/mocks/collections'
import {
  dbItemMock,
  dbTPItemMock,
  itemFragmentMock,
  thirdPartyItemFragmentMock,
  ResultItem,
  toResultItem,
  toResultTPItem,
  asResultItem,
} from '../../spec/mocks/items'
import { itemCurationMock } from '../../spec/mocks/itemCuration'
import { tpWearableMock, wearableMock } from '../../spec/mocks/peer'
import { wallet } from '../../spec/mocks/wallet'
import { isCommitteeMember } from '../Committee'
import { app } from '../server'
import { ItemCuration, ItemCurationAttributes } from '../Curation/ItemCuration'
import { CurationStatus } from '../Curation'
import { Collection } from '../Collection/Collection.model'
import { collectionAPI } from '../ethereum/api/collection'
import { CatalystItem, peerAPI } from '../ethereum/api/peer'
import { ItemFragment } from '../ethereum/api/fragments'
import { STATUS_CODES } from '../common/HTTPError'
import { Bridge } from '../ethereum/api/Bridge'
import {
  CollectionAttributes,
  ThirdPartyCollectionAttributes,
} from '../Collection/Collection.types'
import { VIDEO_PATH, buildTPItemURN } from './utils'
import { hasPublicAccess } from './access'
import { Item, ItemMappingStatus } from './Item.model'
import {
  FullItem,
  ItemAttributes,
  ItemType,
  ThirdPartyItemAttributes,
} from './Item.types'
import { ThirdPartyService } from '../ThirdParty/ThirdParty.service'

jest.mock('../ethereum/api/collection')
jest.mock('../ethereum/api/peer')
jest.mock('../ThirdParty/ThirdParty.service')
jest.mock('../utils/eth')
jest.mock('../Collection/Collection.model')
jest.mock('../Curation/ItemCuration')
jest.mock('../Committee')
jest.mock('./access')
jest.mock('./Item.model')

function mockItemConsolidation(wearables: CatalystItem[]) {
  ;(peerAPI.fetchItems as jest.Mock).mockResolvedValueOnce(wearables)
  ;(collectionAPI.buildItemId as jest.Mock).mockImplementation(
    (contractAddress, tokenId) => contractAddress + '-' + tokenId
  )
}

const server = supertest(app.getApp())

describe('Item router', () => {
  let dbItem: ItemAttributes
  let dbItemCuration: ItemCurationAttributes
  let dbTPItem: ThirdPartyItemAttributes
  let dbItemNotPublished: ItemAttributes
  let dbTPItemNotPublished: ThirdPartyItemAttributes
  let dbTPItemPublished: ThirdPartyItemAttributes
  let resultingItem: ResultItem
  let resultingTPItem: ResultItem
  let resultItemNotPublished: ResultItem
  let resultTPItemNotPublished: ResultItem
  let resultTPItemPublished: ResultItem
  let wearable: Wearable
  let tpWearable: Wearable
  let itemFragment: ItemFragment
  let url: string

  beforeEach(() => {
    dbItem = { ...dbItemMock }
    dbTPItem = { ...dbTPItemMock }
    itemFragment = { ...itemFragmentMock }
    wearable = {
      ...wearableMock,
    }
    tpWearable = {
      ...tpWearableMock,
      id: thirdPartyItemFragmentMock.urn,
    }
    dbItemNotPublished = {
      ...dbItem,
      id: uuidv4(),
      blockchain_item_id: null,
    }
    dbTPItemNotPublished = {
      ...dbTPItem,
      id: uuidv4(),
      urn_suffix: '23',
    }
    dbTPItemPublished = {
      ...dbTPItem,
      id: uuidv4(),
      urn_suffix: '3',
    }
    dbItemCuration = { ...itemCurationMock, item_id: dbTPItemPublished.id }
    resultingItem = toResultItem(dbItem, itemFragment, wearable)
    resultingTPItem = toResultTPItem(dbTPItem, dbTPCollectionMock, tpWearable)
    resultItemNotPublished = asResultItem(dbItemNotPublished)
    resultTPItemNotPublished = asResultItem(dbTPItemNotPublished) // no itemCuration & no catalyst, should be regular Item
    resultTPItemPublished = {
      ...toResultTPItem(dbTPItemPublished, dbTPCollectionMock),
    }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when getting an item', () => {
    beforeEach(() => {
      mockExistsMiddleware(Item, dbItem.id)
      ;(hasPublicAccess as jest.Mock).mockResolvedValueOnce(true)
      ;(Item.findOne as jest.Mock).mockResolvedValueOnce(dbItem)
      url = `/items/${dbItem.id}`
    })

    describe('when the item belongs to a published collection', () => {
      beforeEach(() => {
        dbItem.collection_id = dbCollectionMock.id
        dbItem.blockchain_item_id = '0'
        ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
          dbCollectionMock
        )
        ;(collectionAPI.fetchCollectionWithItem as jest.Mock).mockResolvedValueOnce(
          { collection: itemFragment.collection, item: itemFragment }
        )
        ;(peerAPI.fetchItems as jest.Mock).mockResolvedValueOnce([wearable])
        resultingItem = toResultItem(dbItem, itemFragment, wearable)
      })

      it('should return the requested item with its URN', () => {
        return server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(200)
          .then((response: any) => {
            expect(collectionAPI.fetchCollectionWithItem).toHaveBeenCalledWith(
              dbCollectionMock.contract_address,
              `${dbCollectionMock.contract_address}-${dbItem.blockchain_item_id}`
            )
            expect(response.body).toEqual({
              data: {
                ...resultingItem,
                beneficiary: itemFragment.beneficiary,
                collection_id: dbItem.collection_id,
                blockchain_item_id: dbItem.blockchain_item_id,
                urn: itemFragmentMock.urn,
              },
              ok: true,
            })
            expect(Item.findOne).toHaveBeenCalledWith(dbItem.id)
          })
      })
    })

    describe("when the item doesn't belong to a collection", () => {
      beforeEach(() => {
        dbItem.collection_id = null
        resultingItem = toResultItem(dbItem)
      })

      it('should return the requested item with a nulled URN', () => {
        return server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(200)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: { ...resultingItem, collection_id: null },
              ok: true,
            })
            expect(Item.findOne).toHaveBeenCalledWith(dbItem.id)
          })
      })
    })

    describe("when the item doesn't belong to a published collection", () => {
      beforeEach(() => {
        dbItem.collection_id = 'aCollectionId'
        dbItem.blockchain_item_id = null
        resultingItem = toResultItem(dbItem)
      })

      it('should return the requested item with a nulled URN', () => {
        return server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(200)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: {
                ...resultingItem,
                collection_id: dbItem.collection_id,
                blockchain_item_id: null,
              },
              ok: true,
            })
            expect(Item.findOne).toHaveBeenCalledWith(dbItem.id)
          })
      })
    })
  })

  describe('when getting all the items', () => {
    let dbTPItemNotPublishedMock: ThirdPartyItemAttributes

    beforeEach(() => {
      dbItemCuration.is_mapping_complete = false
      dbTPItemNotPublishedMock = {
        ...dbTPItemNotPublished,
        urn_suffix: '2',
      }
      ;(isCommitteeMember as jest.Mock).mockResolvedValueOnce(true)
      ;(Item.find as jest.Mock).mockResolvedValueOnce([
        dbItem,
        dbTPItemMock,
        dbTPItemNotPublishedMock,
        dbItemNotPublished,
        dbTPItemPublished,
      ])
      ;(ItemCuration.find as jest.Mock).mockResolvedValueOnce([dbItemCuration])
      ;(collectionAPI.fetchItems as jest.Mock).mockResolvedValueOnce([
        itemFragment,
      ])
      ;(Collection.findByIds as jest.Mock).mockImplementation((ids) =>
        [dbCollectionMock, dbTPCollectionMock].filter((collection) =>
          ids.includes(collection.id)
        )
      )
      mockItemConsolidation([wearable])
      ;(peerAPI.fetchWearables as jest.Mock).mockResolvedValueOnce([tpWearable])
      url = '/items'
    })

    it('should return all the items that are published with URN and the ones that are not without it', () => {
      return server
        .get(buildURL(url))
        .set(createAuthHeaders('get', url))
        .expect(200)
        .then((response: any) => {
          expect(response.body).toEqual({
            data: [
              {
                ...resultingItem,
                beneficiary: itemFragment.beneficiary,
                urn: itemFragmentMock.urn,
              },
              resultItemNotPublished,
              resultingTPItem,
              {
                ...resultTPItemNotPublished,
                price: '0',
                urn: buildTPItemURN(
                  dbTPCollectionMock.third_party_id,
                  dbTPCollectionMock.urn_suffix,
                  dbTPItemNotPublishedMock.urn_suffix!
                ),
                isMappingComplete: false,
                blockchain_item_id: '2',
              },
              { ...resultTPItemPublished, is_published: true },
            ],
            ok: true,
          })
        })
    })
  })

  describe('when getting all the items of an address', () => {
    let allAddressItems: ItemAttributes[]
    beforeEach(() => {
      ;(Collection.findByIds as jest.Mock).mockImplementation((ids) =>
        [dbCollectionMock, dbTPCollectionMock].filter((collection) =>
          ids.includes(collection.id)
        )
      )
      ;(ItemCuration.find as jest.Mock).mockResolvedValueOnce([dbItemCuration])
      mockItemConsolidation([wearable])
      ;(peerAPI.fetchWearables as jest.Mock).mockResolvedValueOnce([tpWearable])
    })

    describe('and the user is not a manger of any third party', () => {
      beforeEach(() => {
        url = `/${wallet.address}/items`
        allAddressItems = [dbItem, dbItemNotPublished]
        ;(Item.findItemsByAddress as jest.Mock).mockResolvedValueOnce(
          allAddressItems.map((item) => ({
            ...item,
            total_count: allAddressItems.length,
          }))
        )
        ;(ThirdPartyService.getThirdParties as jest.Mock).mockResolvedValueOnce(
          []
        )
        ;(collectionAPI.fetchItemsByAuthorizedUser as jest.Mock).mockResolvedValueOnce(
          [itemFragment]
        )
      })

      describe('and the pagination params are not passed', () => {
        it('should return only the items that are owned by the user', () => {
          return server
            .get(buildURL(url))
            .set(createAuthHeaders('get', url))
            .expect(200)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: [
                  {
                    ...resultingItem,
                    beneficiary: itemFragment.beneficiary,
                    collection_id: dbItem.collection_id,
                    blockchain_item_id: dbItem.blockchain_item_id,
                    urn: itemFragmentMock.urn,
                  },
                  resultItemNotPublished,
                ],
                ok: true,
              })

              expect(Item.findItemsByAddress).toHaveBeenCalledWith(
                wallet.address,
                [],
                {
                  page: undefined,
                  limit: undefined,
                  collecitonId: undefined,
                }
              )
            })
        })
      })
    })

    describe('and the user is manager of a third party', () => {
      beforeEach(() => {
        allAddressItems = [dbItem, dbItemNotPublished, dbTPItem]
        ;(Item.findItemsByAddress as jest.Mock).mockResolvedValueOnce(
          allAddressItems.map((item) => ({
            ...item,
            total_count: allAddressItems.length,
          }))
        )
        ;(ThirdPartyService.getThirdParties as jest.Mock).mockResolvedValueOnce(
          [thirdPartyFragmentMock]
        )
        ;(collectionAPI.fetchItemsByAuthorizedUser as jest.Mock).mockResolvedValueOnce(
          [itemFragment]
        )
      })

      describe('and the pagination params are not passed', () => {
        beforeEach(() => {
          url = `/${wallet.address}/items`
        })
        it('should return all the items of an address that are published with URN and the ones that are not without it', () => {
          return server
            .get(buildURL(url))
            .set(createAuthHeaders('get', url))
            .expect(200)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: [
                  {
                    ...resultingItem,
                    beneficiary: itemFragment.beneficiary,
                    collection_id: dbItem.collection_id,
                    blockchain_item_id: dbItem.blockchain_item_id,
                    urn: itemFragmentMock.urn,
                  },
                  resultItemNotPublished,
                  resultingTPItem,
                ],
                ok: true,
              })
              expect(Item.findItemsByAddress).toHaveBeenCalledWith(
                wallet.address,
                [thirdPartyFragmentMock.id],
                {
                  page: undefined,
                  limit: undefined,
                  collecitonId: undefined,
                }
              )
            })
        })
      })

      describe('and pagination & collectionId params are passed', () => {
        let baseUrl: string
        let page: number
        let limit: number
        let collectionId: string

        beforeEach(() => {
          ;(page = 1), (limit = 1), (collectionId = 'null')
          baseUrl = `/${wallet.address}/items`
          url = `${baseUrl}?limit=${limit}&page=${page}&collectionId=${collectionId}`
        })

        it('should call the find method with the pagination params', () => {
          return server
            .get(buildURL(url))
            .set(createAuthHeaders('get', baseUrl))
            .expect(200)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: {
                  total: allAddressItems.length,
                  pages: allAddressItems.length,
                  page,
                  limit,
                  results: [
                    {
                      ...resultingItem,
                      beneficiary: itemFragment.beneficiary,
                      collection_id: dbItem.collection_id,
                      blockchain_item_id: dbItem.blockchain_item_id,
                      urn: itemFragmentMock.urn,
                    },
                    resultItemNotPublished,
                    resultingTPItem,
                  ],
                },
                ok: true,
              })
              expect(Item.findItemsByAddress).toHaveBeenCalledWith(
                wallet.address,
                [thirdPartyFragmentMock.id],
                {
                  limit,
                  offset: page - 1, // it's the offset
                  collectionId,
                }
              )
            })
        })
      })
    })
  })

  describe('when getting all the items of a collection', () => {
    describe('and the collection is a DCL collection', () => {
      let itemsForCollection: ItemAttributes[]
      beforeEach(() => {
        itemsForCollection = [dbItemMock, dbItemNotPublished]
        ;(Item.findByCollectionId as jest.Mock).mockResolvedValueOnce(
          itemsForCollection.map((item) => ({
            ...item,
            total_count: itemsForCollection.length,
          }))
        )
        ;(collectionAPI.fetchCollectionWithItemsByContractAddress as jest.Mock).mockResolvedValueOnce(
          { collection: itemFragment.collection, items: [itemFragment] }
        )
        ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
          dbCollectionMock
        )
        ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
          dbCollectionMock,
        ])
        mockItemConsolidation([wearable])
      })

      describe('and there pagination params are not passed', () => {
        beforeEach(() => {
          url = `/collections/${dbCollectionMock.id}/items`
        })
        it('should return all the items of a collection with their URN', () => {
          return server
            .get(buildURL(url))
            .set(createAuthHeaders('get', url))
            .expect(200)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: [
                  {
                    ...resultingItem,
                    beneficiary: itemFragment.beneficiary,
                    collection_id: dbItem.collection_id,
                    blockchain_item_id: dbItem.blockchain_item_id,
                    urn: itemFragmentMock.urn,
                  },
                  resultItemNotPublished,
                ],
                ok: true,
              })
              expect(Item.findByCollectionId).toHaveBeenCalledWith(
                dbCollectionMock.id,
                {
                  synced: undefined,
                  status: undefined,
                  mappingStatus: undefined,
                  limit: undefined,
                  offset: undefined,
                }
              )
            })
        })
      })

      describe('and pagination and synced params are passed', () => {
        let baseUrl: string
        let page: number
        let limit: number
        let synced: boolean
        beforeEach(() => {
          page = 1
          limit = 1
          synced = false
          baseUrl = `/collections/${dbCollectionMock.id}/items`
          url = `${baseUrl}?limit=${limit}&page=${page}&synced=${synced}`
        })
        it('should call the find method with the pagination params', () => {
          return server
            .get(buildURL(url))
            .set(createAuthHeaders('get', baseUrl))
            .expect(200)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: {
                  pages: itemsForCollection.length,
                  total: itemsForCollection.length,
                  limit,
                  page,
                  results: [
                    {
                      ...resultingItem,
                      beneficiary: itemFragment.beneficiary,
                      collection_id: dbItem.collection_id,
                      blockchain_item_id: dbItem.blockchain_item_id,
                      urn: itemFragmentMock.urn,
                    },
                    resultItemNotPublished,
                  ],
                },
                ok: true,
              })
              expect(Item.findByCollectionId).toHaveBeenCalledWith(
                dbCollectionMock.id,
                {
                  synced,
                  limit,
                  offset: limit * (page - 1),
                }
              )
            })
        })
      })
    })

    describe('and the collection is a third party collection', () => {
      beforeEach(() => {
        ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
          dbTPCollectionMock
        )
        ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
          dbTPCollectionMock,
        ])
        ;(collectionAPI.buildItemId as jest.Mock).mockImplementation(
          (contractAddress, tokenId) => contractAddress + '-' + tokenId
        )
        const tpWearableWithMappings: Wearable & Partial<ThirdPartyProps> = {
          ...tpWearable,
          mappings: {
            [ContractNetwork.SEPOLIA]: {
              '0x0': [{ type: MappingType.SINGLE, id: '4' }],
            },
          },
        }
        resultingTPItem = toResultTPItem(
          dbTPItem,
          dbTPCollectionMock,
          tpWearableWithMappings,
          dbItemCuration
        )
        ;(peerAPI.fetchWearables as jest.Mock).mockResolvedValueOnce([
          tpWearableWithMappings,
        ])
      })

      describe('and the mapping status filter is applied', () => {
        beforeEach(() => {
          dbItemCuration = { ...dbItemCuration, is_mapping_complete: false }
          ;(ItemCuration.findByCollectionId as jest.Mock).mockResolvedValueOnce(
            [dbItemCuration]
          )
          ;(Item.findByCollectionId as jest.Mock).mockResolvedValueOnce([
            dbTPItem,
            dbTPItemPublished,
          ])
          url = `/collections/${dbTPCollectionMock.id}/items`
        })

        it('should return all the items of a collection that comply with the mapping status filter', async () => {
          const response = await server
            .get(buildURL(url))
            .set(createAuthHeaders('get', url))
            .query({ mappingStatus: ItemMappingStatus.MISSING_MAPPING })
            .expect(200)

          expect(response.body).toEqual({
            data: [
              {
                ...resultingTPItem,
                isMappingComplete: false,
              },
              { ...resultTPItemPublished, is_published: true },
            ],
            ok: true,
          })

          expect(Item.findByCollectionId as jest.Mock).toHaveBeenLastCalledWith(
            dbTPCollectionMock.id,
            {
              synced: undefined,
              status: undefined,
              mappingStatus: ItemMappingStatus.MISSING_MAPPING,
              limit: undefined,
              offset: undefined,
            }
          )
        })
      })

      describe('and there are not filters applied', () => {
        beforeEach(() => {
          dbItemCuration = { ...dbItemCuration, is_mapping_complete: true }
          ;(ItemCuration.findByCollectionId as jest.Mock).mockResolvedValueOnce(
            [dbItemCuration]
          )
          ;(Item.findByCollectionId as jest.Mock).mockResolvedValueOnce([
            dbTPItem,
            dbTPItemPublished,
          ])
          url = `/collections/${dbTPCollectionMock.id}/items`
        })

        it('should return all the items of a collection with their URNs and the isMappingComplete property as true for the item with a mapping', () => {
          return server
            .get(buildURL(url))
            .set(createAuthHeaders('get', url))
            .expect(200)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: [
                  resultingTPItem,
                  {
                    ...resultTPItemPublished,
                    is_published: true,
                    isMappingComplete: true,
                  },
                ],
                ok: true,
              })
            })
        })
      })
    })
  })

  describe('when upserting an item', () => {
    const mockCollection = Collection as jest.Mocked<typeof Collection>
    const mockItem = Item as jest.MockedClass<typeof Item> &
      jest.Mocked<typeof Item>

    const mockUUID = '75e7da02-a727-48de-a4da-d0778395067b'
    let itemToUpsert: FullItem
    let collectionMock: CollectionAttributes
    let tpCollectionMock: ThirdPartyCollectionAttributes

    beforeEach(() => {
      url = `/items/${dbItem.id}`
      collectionMock = { ...dbCollectionMock }
      tpCollectionMock = { ...dbTPCollectionMock }
    })

    describe('and the item is a third party item', () => {
      const itemUrnSuffix = 'an-item-urn-suffix'

      beforeEach(() => {
        url = `/items/${dbTPItem.id}`
        dbTPItem = { ...dbTPItem, blockchain_item_id: null }
        itemToUpsert = utils.omit(dbTPItem, ['created_at', 'updated_at'])
      })

      describe('and the user upserting is not authorized to do so', () => {
        beforeEach(() => {
          url = `/items/${dbTPItem.id}`
          itemToUpsert = {
            ...itemToUpsert,
            collection_id: tpCollectionMock.id,
            urn: buildTPItemURN(
              tpCollectionMock.third_party_id,
              tpCollectionMock.urn_suffix,
              dbTPItem.urn_suffix
            ),
          }
          mockItem.findOne.mockResolvedValueOnce(itemToUpsert)
          ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
            tpCollectionMock,
          ])
          mockIsThirdPartyManager(wallet.address, false)
        })

        it('should respond with a 401 signaling that the user is unauthorized to upsert the item in the collection', () => {
          return server
            .put(buildURL(url))
            .send({ item: itemToUpsert })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.unauthorized)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: { id: dbTPItem.id, eth_address: wallet.address },
                error: 'The user is unauthorized to upsert the collection.',
                ok: false,
              })
            })
        })
      })

      describe('and the item being upserted does not have a valid mapping', () => {
        beforeEach(() => {
          url = `/items/${dbTPItem.id}`
          itemToUpsert = {
            ...itemToUpsert,
            mappings: {
              amoy: {
                '0x74c78f5A4ab22F01d5fd08455cf0Ff5C3367535C': [
                  {
                    type: MappingType.ANY,
                  },
                  { type: MappingType.SINGLE, id: '1' },
                ],
              },
            },
          }
          mockIsThirdPartyManager(wallet.address, true)
        })

        it('should respond with a 400 signaling that the mapping is invalid', () => {
          return server
            .put(buildURL(url))
            .send({ item: itemToUpsert })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.badRequest)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: [
                  {
                    instancePath: '/item/mappings',
                    keyword: '_isMappingsValid',
                    message: 'must pass "_isMappingsValid" keyword validation',
                    params: {},
                    schemaPath:
                      '#/properties/item/oneOf/0/properties/mappings/_isMappingsValid',
                  },
                ],
                error: 'Invalid request body',
                ok: false,
              })
            })
        })
      })

      describe("and the item's urn is not valid", () => {
        beforeEach(() => {
          url = `/items/${dbTPItem.id}`
          itemToUpsert = { ...itemToUpsert, urn: 'some-invalid-urn' }
        })

        it('should respond with a 400 and a message signaling that the URN is invalid', () => {
          return server
            .put(buildURL(url))
            .send({ item: itemToUpsert })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.badRequest)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: [
                  expect.objectContaining({
                    instancePath: '/item/urn',
                    keyword: 'pattern',
                  }),
                ],
                error: 'Invalid request body',
                ok: false,
              })
            })
        })
      })

      describe("and the item contains a representation with file names that aren't included in the contents", () => {
        beforeEach(() => {
          url = `/items/${dbTPItem.id}`
          itemToUpsert = {
            ...itemToUpsert,
            data: {
              ...itemToUpsert.data,
              representations: [
                {
                  ...itemToUpsert.data.representations[0],
                  mainFile: 'some-file-that-does-not-exist.glb',
                  contents: ['male/another-file-that-doesnt-exist.glb'],
                },
              ],
            },
          }
        })

        it('should respond with a 400 and a message signaling that the representation contains files that are not included in the contents', () => {
          return server
            .put(buildURL(url))
            .send({ item: itemToUpsert })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.badRequest)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: {
                  id: itemToUpsert.id,
                },
                error:
                  "Representation files must be part of the item's content",
                ok: false,
              })
            })
        })
      })

      describe('and the item is being updated', () => {
        beforeEach(() => {
          mockIsThirdPartyManager(wallet.address, true)
        })

        describe('and the update moves the item out of the collection', () => {
          beforeEach(() => {
            url = `/items/${dbTPItem.id}`
            itemToUpsert = { ...itemToUpsert, collection_id: null }
            dbTPItem = { ...dbTPItem, collection_id: tpCollectionMock.id }
            mockItem.findOne.mockResolvedValueOnce({
              ...dbTPItem,
              collection_id: tpCollectionMock.id,
              urn_suffix: itemUrnSuffix,
            })
            mockCollection.findByIds.mockResolvedValueOnce([
              { ...tpCollectionMock, item_count: 1 },
            ])
          })

          it("should respond with a 401 and a message saying that the item can't be changed between collections", () => {
            return server
              .put(buildURL(url))
              .send({ item: itemToUpsert })
              .set(createAuthHeaders('put', url))
              .expect(401)
              .then((response: any) => {
                expect(response.body).toEqual({
                  data: {
                    id: itemToUpsert.id,
                  },
                  error: "Item can't change between collections.",
                  ok: false,
                })
              })
          })
        })

        describe('and the update moves the item into another TP collection', () => {
          beforeEach(() => {
            url = `/items/${dbTPItem.id}`
            mockItem.findOne.mockResolvedValueOnce({
              ...itemToUpsert,
              collection_id: 'someOtherId',
              urn_suffix: null,
            })
            mockCollection.findByIds.mockImplementation(async (ids) =>
              [
                { ...dbTPCollectionMock, id: 'someOtherId', item_count: 1 },
                { ...dbTPCollectionMock, item_count: 1 },
              ].filter((collection) => ids.includes(collection.id))
            )
            itemToUpsert = {
              ...itemToUpsert,
              collection_id: tpCollectionMock.id,
            }
          })

          it("should respond with a 401 and a message saying that the item can't be changed between collections", () => {
            return server
              .put(buildURL(url))
              .send({ item: itemToUpsert })
              .set(createAuthHeaders('put', url))
              .expect(401)
              .then((response: any) => {
                expect(response.body).toEqual({
                  data: {
                    id: itemToUpsert.id,
                  },
                  error: "Item can't change between collections.",
                  ok: false,
                })
              })
          })
        })

        describe("and the item's collection doesn't change", () => {
          let dbTPItemURN: string

          beforeEach(() => {
            dbTPItem = { ...dbTPItem, urn_suffix: itemUrnSuffix }
            dbTPItemURN = buildTPItemURN(
              tpCollectionMock.third_party_id,
              tpCollectionMock.urn_suffix,
              itemUrnSuffix
            )
            mockItem.findOne.mockResolvedValueOnce({
              ...dbTPItem,
              collection_id: tpCollectionMock.id,
              urn_suffix: itemUrnSuffix,
            })
            mockCollection.findByIds.mockResolvedValueOnce([
              { ...tpCollectionMock, item_count: 1 },
            ])
          })

          describe('and it is updating the item by id', () => {
            beforeEach(() => {
              url = `/items/${dbTPItem.id}`
            })
            describe('and the URN changes', () => {
              beforeEach(() => {
                itemToUpsert = {
                  ...itemToUpsert,
                  collection_id: tpCollectionMock.id,
                  urn: buildTPItemURN(
                    tpCollectionMock.third_party_id,
                    tpCollectionMock.urn_suffix,
                    'some-other-item-urn-suffix'
                  ),
                }
              })

              describe('and the item is already published', () => {
                beforeEach(() => {
                  mockThirdPartyItemCurationExists(dbTPItem.id, true)
                })

                it('should fail with 409 and a message saying that the item is already published', () => {
                  return server
                    .put(buildURL(url))
                    .send({ item: itemToUpsert })
                    .set(createAuthHeaders('put', url))
                    .expect(409)
                    .then((response: any) => {
                      expect(response.body).toEqual({
                        data: {
                          id: itemToUpsert.id,
                          urn: dbTPItemURN,
                        },
                        error:
                          "The third party item is already published. It can't be inserted or updated.",
                        ok: false,
                      })
                    })
                })
              })

              describe('and the item is not published but the new URN is already in use', () => {
                describe('if the URN is in the catalyst', () => {
                  beforeEach(() => {
                    mockThirdPartyItemCurationExists(dbTPItem.id, false)
                    mockThirdPartyURNExists(itemToUpsert.urn!, true)
                  })
                  it('should fail with 409 and a message saying that the URN is already assigned to another item', () => {
                    return server
                      .put(buildURL(url))
                      .send({ item: itemToUpsert })
                      .set(createAuthHeaders('put', url))
                      .expect(409)
                      .then((response: any) => {
                        expect(response.body).toEqual({
                          data: {
                            id: itemToUpsert.id,
                            urn: itemToUpsert.urn!,
                          },
                          error:
                            "The URN provided already belong to another item. The item can't be inserted or updated.",
                          ok: false,
                        })
                      })
                  })
                })

                describe('if there is a db item with the same third_party_id & urn_suffix', () => {
                  beforeEach(() => {
                    mockItem.isURNRepeated.mockResolvedValueOnce(true)
                  })
                  it('should fail with 409 and a message saying that the URN is already assigned to another item', () => {
                    return server
                      .put(buildURL(url))
                      .send({ item: itemToUpsert })
                      .set(createAuthHeaders('put', url))
                      .expect(409)
                      .then((response: any) => {
                        expect(response.body).toEqual({
                          data: {
                            id: itemToUpsert.id,
                            urn: itemToUpsert.urn!,
                          },
                          error:
                            "The URN provided already belong to another item. The item can't be inserted or updated.",
                          ok: false,
                        })
                      })
                  })
                })
              })
            })

            describe("and the URN doesn't change", () => {
              let resultingItem: ResultItem

              beforeEach(() => {
                itemToUpsert = {
                  ...itemToUpsert,
                  collection_id: tpCollectionMock.id,
                  urn: dbTPItemURN,
                }
                mockItem.upsert.mockImplementation((createdItem) =>
                  Promise.resolve({
                    ...createdItem,
                    blockchain_item_id: null,
                  })
                )
                const updatedItem = {
                  ...dbTPItem,
                  urn_suffix: itemUrnSuffix,
                  collection_id: tpCollectionMock.id,
                  eth_address: wallet.address,
                  local_content_hash:
                    'b3520ef20163848f0fc69fc6aee1f7240c7ef4960944fcd92ce2e67a62828f6f',
                }
                resultingItem = {
                  ...toResultTPItem(updatedItem, tpCollectionMock),
                  updated_at: expect.stringMatching(isoDateStringMatcher),
                }
                // Mock get TP item
                mockThirdPartyItemCurationExists(dbTPItem.id, false)
                mockThirdPartyURNExists(itemToUpsert.urn!, false)
              })

              it('should respond with a 200, update the item and return the updated item', () => {
                return server
                  .put(buildURL(url))
                  .send({ item: itemToUpsert })
                  .set(createAuthHeaders('put', url))
                  .expect(200)
                  .then((response: any) => {
                    expect(response.body).toEqual({
                      data: resultingItem,
                      ok: true,
                    })
                  })
              })

              it('should update the item curation with the new content_hash', () => {
                return server
                  .put(buildURL(url))
                  .send({ item: itemToUpsert })
                  .set(createAuthHeaders('put', url))
                  .expect(200)
                  .then(() => {
                    expect(ItemCuration.update).toHaveBeenCalledWith(
                      {
                        content_hash:
                          'b3520ef20163848f0fc69fc6aee1f7240c7ef4960944fcd92ce2e67a62828f6f',
                      },
                      {
                        item_id: itemToUpsert.id,
                        status: CurationStatus.PENDING,
                      }
                    )
                  })
              })
            })
          })

          describe('and it is updating the item by URN', () => {
            let urn: string
            beforeEach(() => {
              urn = buildTPItemURN(
                tpCollectionMock.third_party_id,
                tpCollectionMock.urn_suffix,
                itemUrnSuffix
              )
              url = `/items/${urn}`
              mockItem.upsert.mockImplementation((createdItem) =>
                Promise.resolve({
                  ...createdItem,
                  blockchain_item_id: null,
                })
              )
              const updatedItem = {
                ...dbTPItem,
                urn_suffix: itemUrnSuffix,
                collection_id: tpCollectionMock.id,
                eth_address: wallet.address,
                local_content_hash:
                  'b3520ef20163848f0fc69fc6aee1f7240c7ef4960944fcd92ce2e67a62828f6f',
              }
              resultingItem = {
                ...toResultTPItem(updatedItem, tpCollectionMock),
                updated_at: expect.stringMatching(isoDateStringMatcher),
              }
              // Mock get TP item
              mockThirdPartyItemCurationExists(dbTPItem.id, false)
              mockThirdPartyURNExists(itemToUpsert.urn!, false)
            })

            it('it should respond with a 400 when the urn in the url does not match the one in the body', () => {
              return server
                .put(buildURL(url))
                .send({ item: itemToUpsert })
                .set(createAuthHeaders('put', url))
                .expect(400)
                .then((response: any) => {
                  expect(response.body).toEqual({
                    error: 'The body and URL item id or urn do not match',
                    data: {
                      urlId: urn,
                    },
                    ok: false,
                  })
                })
            })

            it('should not check if the URN is repeated when upserting by URN', () => {
              return server
                .put(buildURL(url))
                .send({
                  item: {
                    ...itemToUpsert,
                    urn,
                    collection_id: tpCollectionMock.id,
                  },
                })
                .set(createAuthHeaders('put', url))
                .expect(200)
                .then(() => {
                  expect(Item.isURNRepeated).not.toHaveBeenCalled()
                })
            })

            it('should respond with a 200, update the item and return the updated item', () => {
              return server
                .put(buildURL(url))
                .send({
                  item: {
                    ...itemToUpsert,
                    urn,
                    collection_id: tpCollectionMock.id,
                  },
                })
                .set(createAuthHeaders('put', url))
                .expect(200)
                .then((response: any) => {
                  expect(response.body).toEqual({
                    data: resultingItem,
                    ok: true,
                  })
                })
            })
          })
        })
      })

      describe('and the item is being inserted', () => {
        beforeEach(() => {
          mockItem.findOne.mockResolvedValueOnce(undefined)
          mockCollection.findByIds.mockResolvedValueOnce([
            { ...tpCollectionMock, item_count: 1 },
          ])
          mockIsThirdPartyManager(wallet.address, true)
        })

        describe('and the item is being inserted by URN as param in the URI', () => {
          describe('and the item does not exist', () => {
            let urn: string
            beforeEach(() => {
              mockItem.findByURNSuffix.mockResolvedValueOnce(undefined)
              url = `/items/${urn}`
              urn = buildTPItemURN(
                tpCollectionMock.third_party_id,
                tpCollectionMock.urn_suffix,
                itemUrnSuffix
              )
            })
            it('should throw a not found error', () => {
              return server
                .put(buildURL(`/items/${urn}`))
                .send({ item: { ...omit<Item>(itemToUpsert, ['id']), urn } })
                .set(createAuthHeaders('put', `/items/${urn}`))
                .expect(404)
                .then((response: any) => {
                  expect(response.body).toEqual({
                    error: 'The third party item can not be created by URN.',
                    data: {
                      urn,
                    },
                    ok: false,
                  })
                })
            })
          })

          describe('and the item to insert has an URN', () => {
            beforeEach(() => {
              itemToUpsert = {
                ...itemToUpsert,
                collection_id: tpCollectionMock.id,
                urn: buildTPItemURN(
                  tpCollectionMock.third_party_id,
                  tpCollectionMock.urn_suffix,
                  itemUrnSuffix
                ),
              }
            })

            describe('and the URN is already in use', () => {
              beforeEach(() => {
                mockThirdPartyURNExists(itemToUpsert.urn!, true)
              })

              it('should fail with 409 and a message saying that the item is already published', () => {
                return server
                  .put(buildURL(url))
                  .send({ item: itemToUpsert })
                  .set(createAuthHeaders('put', url))
                  .expect(409)
                  .then((response: any) => {
                    expect(response.body).toEqual({
                      data: {
                        id: itemToUpsert.id,
                        urn: itemToUpsert.urn!,
                      },
                      error:
                        "The URN provided already belong to another item. The item can't be inserted.",
                      ok: false,
                    })
                  })
              })
            })

            describe('and the URN is not in use', () => {
              let resultingItem: ResultItem

              beforeEach(() => {
                mockItem.upsert.mockImplementation((createdItem) =>
                  Promise.resolve({
                    ...createdItem,
                  })
                )
                itemToUpsert.mappings = {
                  mainnet: {
                    '0x74c78f5A4ab22F01d5fd08455cf0Ff5C3367535C': [
                      { type: MappingType.ANY },
                    ],
                  },
                }
                const updatedItem = {
                  ...dbTPItem,
                  urn_suffix: itemUrnSuffix,
                  collection_id: tpCollectionMock.id,
                  eth_address: wallet.address,
                  mappings: itemToUpsert.mappings,
                  local_content_hash:
                    '037a7a0cf5fa9bcd6b2afc9de8803a3601f50d69e2b0a1757016252f5f34a449',
                }
                mockThirdPartyURNExists(itemToUpsert.urn!, false)
                resultingItem = {
                  ...toResultTPItem(updatedItem, tpCollectionMock),
                  updated_at: expect.stringMatching(isoDateStringMatcher),
                  created_at: expect.stringMatching(isoDateStringMatcher),
                  beneficiary: ethers.constants.AddressZero,
                  blockchain_item_id: updatedItem.urn_suffix,
                  price: '0',
                }
                // Mock get TP item
                mockThirdPartyItemCurationExists(dbTPItem.id, false)
                mockThirdPartyURNExists(itemToUpsert.urn!, false)
              })

              it('should respond with a 200, update the item and return the updated item', () => {
                return server
                  .put(buildURL(url))
                  .send({ item: itemToUpsert })
                  .set(createAuthHeaders('put', url))
                  .expect(200)
                  .then((response: any) => {
                    expect(response.body).toEqual({
                      data: resultingItem,
                      ok: true,
                    })
                  })
              })
            })
          })

          describe("and the item doesn't have an URN", () => {
            beforeEach(() => {
              itemToUpsert = {
                ...itemToUpsert,
                collection_id: tpCollectionMock.id,
                urn: null,
              }
              // Mock get TP item
              mockThirdPartyItemCurationExists(dbTPItem.id, false)
              mockThirdPartyURNExists(itemToUpsert.urn!, false)
            })

            it('should respond with a 400, signaling that the URN is not valid', () => {
              return server
                .put(buildURL(url))
                .send({ item: itemToUpsert })
                .set(createAuthHeaders('put', url))
                .expect(400)
                .then((response: any) => {
                  expect(response.body).toEqual({
                    error: 'The item URN is invalid.',
                    data: {},
                    ok: false,
                  })
                })
            })
          })
        })
      })
    })

    describe('and the item is a DCL item', () => {
      beforeEach(() => {
        itemToUpsert = {
          ...utils.omit(dbItem, ['created_at', 'updated_at']),
          urn: null,
        }
      })

      describe('and the item is an orphan item', () => {
        beforeEach(() => {
          dbItem = { ...dbItem, collection_id: null }
        })

        describe('and the item is converted into a TP item', () => {
          beforeEach(() => {
            itemToUpsert = {
              ...itemToUpsert,
              collection_id: dbTPCollectionMock.id,
            }
            mockItem.findOne.mockResolvedValueOnce({ ...dbItem })
            mockCollection.findByIds
              .mockResolvedValueOnce([{ ...tpCollectionMock, item_count: 1 }])
              .mockResolvedValueOnce([{ ...tpCollectionMock, item_count: 1 }])
          })

          it("should respond with a 401 and a message saying that the item can't be changed between collections", () => {
            return server
              .put(buildURL(url))
              .send({ item: itemToUpsert })
              .set(createAuthHeaders('put', url))
              .expect(401)
              .then((response: any) => {
                expect(response.body).toEqual({
                  data: {
                    id: itemToUpsert.id,
                  },
                  error: "Item can't change between collections.",
                  ok: false,
                })
              })
          })
        })

        describe('and is being moved into a published collection', () => {
          beforeEach(() => {
            mockItem.findOne.mockReset()
            mockItem.findOne.mockResolvedValueOnce({
              ...dbItem,
              collection_id: null,
            })
            mockCollection.findByIds
              .mockResolvedValueOnce([{ ...dbCollectionMock, item_count: 1 }])
              .mockResolvedValueOnce([{ ...dbCollectionMock, item_count: 1 }])
            ;(collectionAPI.fetchCollection as jest.Mock).mockImplementationOnce(
              () =>
                Promise.resolve({
                  ...itemFragment.collection,
                  creator: wallet.address,
                })
            )
            mockOwnableCanUpsert(Item, itemToUpsert.id, wallet.address, true)
          })

          it('should fail with can not add the item to a published collection message', async () => {
            const response = await server
              .put(buildURL(url))
              .send({
                item: { ...itemToUpsert, collection_id: collectionMock.id },
              })
              .set(createAuthHeaders('put', url))
              .expect(STATUS_CODES.conflict)

            expect(response.body).toEqual({
              data: { id: itemToUpsert.id },
              error:
                "The collection that contains this item has been already published. The item can't be inserted or updated.",
              ok: false,
            })
          })
        })

        describe("and the user doesn't have permission to insert or update the item", () => {
          beforeEach(() => {
            itemToUpsert = {
              ...itemToUpsert,
              eth_address: 'not the user wallet',
              collection_id: null,
            }
            mockItem.findOne.mockResolvedValueOnce(itemToUpsert)
            mockCollection.findByIds.mockResolvedValueOnce([
              { ...dbCollectionMock, item_count: 1 },
            ])
          })

          it('should respond with a 401 status code and a message saying that the user is unauthorized to upsert the collection', async () => {
            const response = await server
              .put(buildURL(url))
              .send({ item: itemToUpsert })
              .set(createAuthHeaders('put', url))
              .expect(STATUS_CODES.unauthorized)

            expect(response.body).toEqual({
              data: { id: dbItem.id, eth_address: wallet.address },
              error: 'The user is unauthorized to upsert the collection.',
              ok: false,
            })
          })
        })
      })

      describe('and the item inserted has an invalid type', () => {
        it("should fail with a message indicating that the type doesn't match the available types", () => {
          return server
            .put(buildURL(url))
            .send({ item: { ...itemToUpsert, type: 'anInvalidType' } })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.badRequest)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: [
                  {
                    instancePath: '/item',
                    keyword: 'discriminator',
                    message: 'value of tag "type" must be in oneOf',
                    params: {
                      error: 'mapping',
                      tag: 'type',
                      tagValue: 'anInvalidType',
                    },
                    schemaPath: `#/properties/item/discriminator`,
                  },
                ],
                error: 'Invalid request body',
                ok: false,
              })
            })
        })
      })

      describe('and the item inserted has an invalid name', () => {
        it.each([
          [0, ItemType.WEARABLE],
          [1, ItemType.EMOTE],
        ])(
          "should fail with a message indicating that the name doesn't match the pattern",
          (schemaItemTypeIdx, type) => {
            return server
              .put(buildURL(url))
              .send({ item: { ...itemToUpsert, name: 'anInvalid:name', type } })
              .set(createAuthHeaders('put', url))
              .expect(STATUS_CODES.badRequest)
              .then((response: any) => {
                expect(response.body).toEqual({
                  data: [
                    {
                      instancePath: '/item/name',
                      keyword: 'pattern',
                      message: 'must match pattern "^[^:]*$"',
                      params: { pattern: '^[^:]*$' },
                      schemaPath: `#/properties/item/oneOf/${schemaItemTypeIdx}/properties/name/pattern`,
                    },
                  ],
                  error: 'Invalid request body',
                  ok: false,
                })
              })
          }
        )
      })

      describe.each([
        { schemaItemTypeIdx: 0, type: ItemType.WEARABLE },
        { schemaItemTypeIdx: 1, type: ItemType.EMOTE },
      ])(
        'and the item inserted of $type type has an invalid description',
        ({ schemaItemTypeIdx, type }) => {
          it("should fail with a message indicating that the description doesn't match the pattern", () => {
            return server
              .put(buildURL(url))
              .send({
                item: {
                  ...itemToUpsert,
                  description: 'anInvalid:nescription',
                  type,
                },
              })
              .set(createAuthHeaders('put', url))
              .expect(STATUS_CODES.badRequest)
              .then((response: any) => {
                expect(response.body).toEqual({
                  data: [
                    {
                      instancePath: '/item/description',
                      keyword: 'pattern',
                      message: 'must match pattern "^[^:]*$"',
                      params: { pattern: '^[^:]*$' },
                      schemaPath: `#/properties/item/oneOf/${schemaItemTypeIdx}/properties/description/pattern`,
                    },
                  ],
                  error: 'Invalid request body',
                  ok: false,
                })
              })
          })
        }
      )
      describe.each([
        { schemaItemTypeIdx: 0, type: ItemType.WEARABLE },
        { schemaItemTypeIdx: 1, type: ItemType.EMOTE },
      ])(
        'and the item inserted of $type type has a longer utility than the permitted one',
        ({ schemaItemTypeIdx, type }) => {
          it("should fail with a message indicating that the utility doesn't match the pattern", () => {
            return server
              .put(buildURL(url))
              .send({
                item: {
                  ...itemToUpsert,
                  utility: 'a'.repeat(65),
                  type,
                },
              })
              .set(createAuthHeaders('put', url))
              .expect(STATUS_CODES.badRequest)
              .then((response: any) => {
                expect(response.body).toEqual({
                  data: [
                    {
                      instancePath: '/item/utility',
                      keyword: 'maxLength',
                      message: 'must NOT have more than 64 characters',
                      params: { limit: 64 },
                      schemaPath: `#/properties/item/oneOf/${schemaItemTypeIdx}/properties/utility/maxLength`,
                    },
                  ],
                  error: 'Invalid request body',
                  ok: false,
                })
              })
          })
        }
      )

      describe('and the item inserted data does not match the item type data schema', () => {
        it('should fail with a message indicating that are missing properties for the data schema', () => {
          return server
            .put(buildURL(url))
            .send({
              item: {
                ...itemToUpsert,
                data: { ...itemToUpsert.data },
                type: ItemType.EMOTE,
              },
            })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.badRequest)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: [
                  {
                    instancePath: '/item/data',
                    keyword: 'required',
                    message: "must have required property 'loop'",
                    params: { missingProperty: 'loop' },
                    schemaPath: `#/properties/item/oneOf/1/properties/data/required`,
                  },
                ],
                error: 'Invalid request body',
                ok: false,
              })
            })
        })
      })

      describe('and the item data does not match the item type data schema', () => {
        it('should fail with a message indicating that are missing properties for the data schema', () => {
          return server
            .put(buildURL(url))
            .send({
              item: {
                ...itemToUpsert,
                data: {
                  ...itemToUpsert.data,
                  requiredPermissions: 'aPermission',
                },
                type: ItemType.WEARABLE,
              },
            })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.badRequest)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: [
                  {
                    instancePath: '/item/data/requiredPermissions',
                    keyword: 'type',
                    message: 'must be array',
                    params: { type: 'array' },
                    schemaPath:
                      '#/properties/item/oneOf/0/properties/data/properties/requiredPermissions/type',
                  },
                ],
                error: 'Invalid request body',
                ok: false,
              })
            })
        })
      })

      describe('and the param id is different from payload id', () => {
        it('should fail with body and url ids do not match message', async () => {
          const response = await server
            .put(buildURL(url))
            .send({ item: { ...itemToUpsert, id: mockUUID } })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.badRequest)

          expect(response.body).toEqual({
            data: { bodyId: mockUUID, urlId: dbItem.id },
            error: 'The body and URL item id or urn do not match',
            ok: false,
          })
        })
      })

      describe('and the user is not an owner nor a manager of the collection', () => {
        beforeEach(() => {
          itemToUpsert = { ...itemToUpsert }
          mockItem.findOne.mockResolvedValueOnce(dbItem)
          mockCollection.findByIds.mockResolvedValueOnce([
            {
              ...dbCollectionMock,
              eth_address: 'not the user address',
              managers: [],
              item_count: 1,
            },
          ])
        })

        it('should respond with a 401 status code and a message saying that the user is unauthorized to upsert the collection', async () => {
          const response = await server
            .put(buildURL(url))
            .send({ item: itemToUpsert })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.unauthorized)

          expect(response.body).toEqual({
            data: {
              id: dbItem.id,
              eth_address: wallet.address,
              collection_id: dbItem.collection_id,
            },
            error: "You're not authorized to to change this collection.",
            ok: false,
          })
        })
      })

      describe('and the collection provided in the payload does not exists in the db', () => {
        beforeEach(() => {
          mockItem.findOne.mockResolvedValueOnce(itemToUpsert)
          mockCollection.findByIds.mockResolvedValueOnce([])
        })

        it('should fail with collection not found message', async () => {
          const response = await server
            .put(buildURL(url))
            .send({ item: itemToUpsert })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.notFound)

          expect(response.body).toEqual({
            data: { collectionId: dbItem.collection_id },
            error: "The collection doesn't exist.",
            ok: false,
          })
        })
      })

      describe('and the collection provided in the payload does not belong to the address making the request', () => {
        const differentEthAddress = '0xc6d2000a7a1ddca92941f4e2b41360fe4ee2abd8'
        beforeEach(() => {
          mockItem.findOne.mockResolvedValueOnce(itemToUpsert)
          mockCollection.findByIds.mockResolvedValueOnce([
            {
              ...collectionMock,
              eth_address: differentEthAddress,
              item_count: 1,
            },
          ])
          mockOwnableCanUpsert(Item, itemToUpsert.id, wallet.address, true)
        })

        it('should fail with unauthorized user message', async () => {
          const response = await server
            .put(buildURL(url))
            .send({ item: itemToUpsert })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.unauthorized)

          expect(response.body).toEqual({
            data: {
              id: itemToUpsert.id,
              eth_address: wallet.address,
              collection_id: itemToUpsert.collection_id,
            },
            error: "You're not authorized to to change this collection.",
            ok: false,
          })
        })
      })

      describe('and the collection of the item is being changed', () => {
        beforeEach(() => {
          mockItem.findOne.mockResolvedValueOnce(itemToUpsert)
          mockCollection.findByIds.mockResolvedValue([
            {
              ...collectionMock,
              eth_address: wallet.address,
              item_count: 1,
            },
          ])
          mockOwnableCanUpsert(Item, itemToUpsert.id, wallet.address, true)
        })

        describe('and the item is moved from a collection that is already published', () => {
          beforeEach(() => {
            mockItem.hasPublishedItems
              .mockResolvedValueOnce(true)
              .mockResolvedValueOnce(false)
          })

          it("should respond a 401 status code with a message saying it can't change the item collection", async () => {
            const response = await server
              .put(buildURL(url))
              .send({ item: { ...itemToUpsert, collection_id: mockUUID } })
              .set(createAuthHeaders('put', url))
              .expect(STATUS_CODES.conflict)

            expect(response.body).toEqual({
              data: { id: dbItem.id },
              error:
                "The collection that contains this item has been already published. The item can't be inserted or updated.",
              ok: false,
            })
          })
        })

        describe('and the collection to move the item to is published', () => {
          beforeEach(() => {
            mockItem.hasPublishedItems
              .mockResolvedValueOnce(false)
              .mockResolvedValueOnce(true)
          })

          it("should respond a 401 status code with a message saying it can't change the item collection", async () => {
            const response = await server
              .put(buildURL(url))
              .send({ item: { ...itemToUpsert, collection_id: mockUUID } })
              .set(createAuthHeaders('put', url))
              .expect(STATUS_CODES.conflict)

            expect(response.body).toEqual({
              data: { id: dbItem.id },
              error:
                "The collection that contains this item has been already published. The item can't be inserted.",
              ok: false,
            })
          })
        })

        describe('and the collection to move the item to is not owned nor managed by the user', () => {
          beforeEach(() => {
            itemToUpsert = { ...itemToUpsert, collection_id: mockUUID }
            mockItem.findOne.mockResolvedValueOnce(dbItem)
            mockItem.hasPublishedItems
              .mockResolvedValueOnce(false)
              .mockResolvedValueOnce(false)
            mockCollection.findByIds
              .mockResolvedValueOnce([
                {
                  ...dbCollectionMock,
                  eth_address: wallet.address,
                  item_count: 1,
                },
              ])
              .mockResolvedValueOnce([
                {
                  ...dbCollectionMock,
                  id: mockUUID,
                  eth_address: 'not the user address',
                  managers: [],
                  item_count: 1,
                },
              ])
          })

          it("should respond a 401 status code with a message saying that it's not authorized to change the collection", async () => {
            const response = await server
              .put(buildURL(url))
              .send({ item: itemToUpsert })
              .set(createAuthHeaders('put', url))
              .expect(STATUS_CODES.unauthorized)

            expect(response.body).toEqual({
              data: {
                id: dbItem.id,
                collection_id: itemToUpsert.collection_id,
                eth_address: wallet.address,
              },
              error: "You're not authorized to to change this collection.",
              ok: false,
            })
          })
        })

        describe('and the collection to move the item from is not owned nor managed by the user', () => {
          beforeEach(() => {
            itemToUpsert = { ...itemToUpsert }
            mockItem.findOne.mockResolvedValueOnce(dbItem)
            mockItem.hasPublishedItems
              .mockResolvedValueOnce(false)
              .mockResolvedValueOnce(false)
            mockCollection.findByIds
              .mockResolvedValueOnce([
                {
                  ...dbCollectionMock,
                  id: mockUUID,
                  eth_address: 'not the user address',
                  managers: [],
                  item_count: 1,
                },
              ])
              .mockResolvedValueOnce([
                {
                  ...dbCollectionMock,
                  eth_address: wallet.address,
                  item_count: 1,
                },
              ])
          })

          it("should respond a 401 status code with a message saying that it's not authorized to change the collection", async () => {
            const response = await server
              .put(buildURL(url))
              .send({ item: itemToUpsert })
              .set(createAuthHeaders('put', url))
              .expect(STATUS_CODES.unauthorized)

            expect(response.body).toEqual({
              data: {
                id: dbItem.id,
                collection_id: dbItem.collection_id,
                eth_address: wallet.address,
              },
              error: "You're not authorized to to change this collection.",
              ok: false,
            })
          })
        })
      })

      describe('when the collection given for the item is locked', () => {
        beforeEach(() => {
          mockCollection.findByIds.mockResolvedValueOnce([
            {
              ...collectionMock,
              eth_address: wallet.address,
              contract_address: Wallet.createRandom().address,
              lock: new Date(),
              item_count: 1,
            },
          ])
          mockOwnableCanUpsert(Item, itemToUpsert.id, wallet.address, true)
          mockIsCollectionPublished(dbCollectionMock.id, false)
        })

        describe('and the item is being changed', () => {
          beforeEach(() => {
            mockItem.findOne.mockResolvedValueOnce(dbItem)
          })

          it('should fail with can not update locked collection items message', async () => {
            const response = await server
              .put(buildURL(url))
              .send({ item: { ...itemToUpsert, name: 'new name' } })
              .set(createAuthHeaders('put', url))
              .expect(STATUS_CODES.locked)

            expect(response.body).toEqual({
              data: {
                id: itemToUpsert.id,
              },
              error:
                "The collection for the item is locked. The item can't be inserted or updated.",
              ok: false,
            })
          })
        })
      })

      describe('when the collection given for the item is already published', () => {
        beforeEach(() => {
          dbItem.collection_id = collectionMock.id
          mockCollection.findByIds.mockResolvedValueOnce([
            {
              ...collectionMock,
              eth_address: wallet.address,
              contract_address: '0x3DC9C91cAB92E5806250E2f5cabe711ad79296ea',
              item_count: 1,
            },
          ])
          mockOwnableCanUpsert(Item, itemToUpsert.id, wallet.address, true)
          mockIsCollectionPublished(collectionMock.id, true)
        })

        describe('and the item is being inserted', () => {
          beforeEach(() => {
            mockItem.findOne.mockResolvedValueOnce(undefined)
            mockCollection.findByIds.mockResolvedValueOnce([
              {
                ...dbCollectionMock,
                item_count: 1,
              },
            ])
            ;(collectionAPI.fetchCollection as jest.Mock).mockReset()
            ;(collectionAPI.fetchCollection as jest.Mock).mockImplementation(
              () =>
                Promise.resolve({
                  ...itemFragment.collection,
                  creator: wallet.address,
                })
            )
          })

          it('should fail with can not add item to published collection message', async () => {
            const response = await server
              .put(buildURL(url))
              .send({ item: itemToUpsert })
              .set(createAuthHeaders('put', url))
              .expect(STATUS_CODES.conflict)

            expect(response.body).toEqual({
              data: { id: itemToUpsert.id },
              error:
                "The collection that contains this item has been already published. The item can't be inserted or updated.",
              ok: false,
            })
          })
        })

        describe('and the item is being updated by a manager', () => {
          let currentDate: Date
          let ethAddress: string

          beforeEach(() => {
            currentDate = new Date()
            jest.useFakeTimers()
            jest.setSystemTime(currentDate)
            ethAddress = '0x1234'
            dbItem = { ...dbItem, eth_address: ethAddress }
            mockItem.upsert.mockImplementation((createdItem) =>
              Promise.resolve({
                ...createdItem,
                blockchain_item_id: dbItem.blockchain_item_id,
                eth_address: ethAddress,
              })
            )
            mockItem.findOne.mockResolvedValueOnce(dbItem)
            mockCollection.findByIds.mockResolvedValueOnce([
              {
                ...dbCollectionMock,
                item_count: 1,
              },
            ])
            ;(collectionAPI.fetchCollection as jest.Mock).mockReset()
            ;(collectionAPI.fetchCollection as jest.Mock).mockImplementation(
              () =>
                Promise.resolve({
                  ...itemFragment.collection,
                  owner: ethAddress,
                  managers: [wallet.address],
                })
            )
            // Mock get item
            mockFetchCollectionWithItem(itemFragment.collection, {
              ...itemFragment,
              totalSupply: '0',
            })
            mockFetchCatalystItems([wearable])
          })

          afterEach(() => {
            jest.useRealTimers()
          })

          it('should respond with the updated item', async () => {
            const response = await server
              .put(buildURL(url))
              .send({ item: itemToUpsert, name: 'aNewName' })
              .set(createAuthHeaders('put', url))
              .expect(STATUS_CODES.ok)

            expect(response.body).toEqual({
              data: {
                ...Bridge.toFullItem(dbItem),
                local_content_hash: expect.any(String),
                eth_address: ethAddress,
                beneficiary: 'aBeneficiary',
                in_catalyst: true,
                is_published: true,
                urn: wearable.id,
                created_at: dbItem.created_at.toISOString(),
                updated_at: currentDate.toISOString(),
              },
              ok: true,
            })
          })
        })

        describe('and the item is being removed from the collection', () => {
          beforeEach(() => {
            mockItem.findOne.mockResolvedValueOnce(itemToUpsert)
            mockCollection.findByIds.mockResolvedValueOnce([
              {
                ...dbCollectionMock,
                item_count: 1,
              },
            ])
            ;(collectionAPI.fetchCollection as jest.Mock).mockReset()
            ;(collectionAPI.fetchCollection as jest.Mock).mockImplementationOnce(
              () =>
                Promise.resolve({
                  ...itemFragment.collection,
                  creator: wallet.address,
                })
            )
          })

          it('should fail with can not remove item from published collection message', async () => {
            const response = await server
              .put(buildURL(url))
              .send({ item: { ...itemToUpsert, collection_id: null } })
              .set(createAuthHeaders('put', url))
              .expect(STATUS_CODES.conflict)

            expect(response.body).toEqual({
              data: { id: itemToUpsert.id },
              error:
                "The collection that contains this item has been already published. The item can't be deleted.",
              ok: false,
            })
          })
        })

        describe("and the item's rarity is being changed", () => {
          beforeEach(() => {
            mockItem.findOne.mockResolvedValueOnce(dbItem)
            mockCollection.findByIds.mockResolvedValueOnce([
              {
                ...dbCollectionMock,
                item_count: 1,
              },
            ])
            ;(collectionAPI.fetchCollection as jest.Mock).mockReset()
            ;(collectionAPI.fetchCollection as jest.Mock).mockImplementationOnce(
              () =>
                Promise.resolve({
                  ...itemFragment.collection,
                  creator: wallet.address,
                })
            )
          })

          it('should fail with can not update items rarity message', async () => {
            const response = await server
              .put(buildURL(url))
              .send({ item: { ...itemToUpsert, rarity: Rarity.EPIC } })
              .set(createAuthHeaders('put', url))
              .expect(STATUS_CODES.conflict)

            expect(response.body).toEqual({
              data: {
                id: itemToUpsert.id,
              },
              error:
                "The collection that contains this item has been already published. The item can't be updated with a new rarity.",
              ok: false,
            })
          })
        })

        describe("and the item's metadata (not rarity nor collection) and content is being updated", () => {
          let currentDate: Date

          beforeEach(() => {
            currentDate = new Date()
            dbItem = { ...dbItem, eth_address: wallet.address }
            jest.useFakeTimers()
            jest.setSystemTime(currentDate)
            mockItem.upsert.mockImplementation((createdItem) =>
              Promise.resolve({
                ...createdItem,
                blockchain_item_id: dbItem.blockchain_item_id,
              })
            )
            mockItem.findOne.mockResolvedValueOnce(dbItem)
            mockCollection.findByIds.mockResolvedValueOnce([
              {
                ...dbCollectionMock,
                item_count: 1,
              },
            ])
            ;(collectionAPI.fetchCollection as jest.Mock).mockReset()
            ;(collectionAPI.fetchCollection as jest.Mock).mockImplementationOnce(
              () =>
                Promise.resolve({
                  ...itemFragment.collection,
                  creator: wallet.address,
                })
            )
            // Mock get item
            mockFetchCollectionWithItem(itemFragment.collection, {
              ...itemFragment,
              totalSupply: '0',
            })
            mockFetchCatalystItems([wearable])
          })

          afterEach(() => {
            jest.useRealTimers()
          })

          it('should respond with the updated item', async () => {
            const response = await server
              .put(buildURL(url))
              .send({ item: itemToUpsert, name: 'aNewName' })
              .set(createAuthHeaders('put', url))
              .expect(STATUS_CODES.ok)

            expect(response.body).toEqual({
              data: {
                ...Bridge.toFullItem(dbItem),
                beneficiary: itemFragment.beneficiary,
                in_catalyst: true,
                is_published: true,
                urn: wearable.id,
                local_content_hash: expect.any(String),
                eth_address: wallet.address,
                created_at: dbItem.created_at.toISOString(),
                updated_at: currentDate.toISOString(),
              },
              ok: true,
            })
          })
        })
      })

      describe('and the collection given for the item is not published', () => {
        let currentDate: Date

        beforeEach(() => {
          currentDate = new Date()
          jest.useFakeTimers()
          jest.setSystemTime(currentDate)
          mockCollection.findByIds.mockResolvedValueOnce([
            {
              ...collectionMock,
              eth_address: wallet.address,
              contract_address: null,
              item_count: 1,
            },
          ])
          mockItem.findOne.mockResolvedValueOnce(undefined)
          mockOwnableCanUpsert(Item, itemToUpsert.id, wallet.address, true)
          mockIsCollectionPublished(collectionMock.id, false)
          mockItem.upsert.mockImplementation((createdItem) =>
            Promise.resolve({
              ...createdItem,
              blockchain_item_id: null,
            })
          )
          const updatedItem: ItemAttributes = {
            ...dbItem,
            eth_address: wallet.address,
            local_content_hash: null,
            updated_at: currentDate,
            created_at: currentDate,
            blockchain_item_id: null,
          }
          resultingItem = {
            ...toResultItem(updatedItem),
          }
        })

        afterEach(() => {
          jest.useRealTimers()
        })

        it('should respond with the upserted item', async () => {
          const response = await server
            .put(buildURL(url))
            .send({ item: itemToUpsert })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.ok)

          expect(response.body).toEqual({
            data: resultingItem,
            ok: true,
          })
        })
      })
    })
  })

  describe('when deleting an item', () => {
    let collectionMock: CollectionAttributes

    beforeEach(() => {
      collectionMock = { ...collectionMock }
    })

    describe('and the item is a DCL item', () => {
      beforeEach(() => {
        url = `/items/${dbItem.id}`
      })
      describe('and the user is not authorized', () => {
        beforeEach(() => {
          mockExistsMiddleware(Item, dbItem.id)
          mockItemAuthorizationMiddleware(dbItem, wallet.address, false, false)
        })

        it('should respond with a 401 and a message signaling that the user is not authorized', () => {
          return server
            .delete(buildURL(url))
            .set(createAuthHeaders('delete', url))
            .expect(401)
            .then((response: any) => {
              expect(response.body).toEqual({
                error: `Unauthorized user ${wallet.address} for items ${dbItem.id}`,
                data: {
                  ethAddress: wallet.address,
                  tableName: Item.tableName,
                },
                ok: false,
              })
            })
        })
      })

      describe("and the item doesn't have a collection", () => {
        beforeEach(() => {
          const mockDbItem = { ...dbItem, collection_id: null }
          mockExistsMiddleware(Item, mockDbItem.id)
          mockItemAuthorizationMiddleware(
            mockDbItem,
            wallet.address,
            false,
            true
          )
          ;(Item.findOne as jest.MockedFunction<
            typeof Item.findOne
          >).mockResolvedValueOnce(mockDbItem)
        })

        it('should respond with a 200 and delete the item', () => {
          return server
            .delete(buildURL(url))
            .set(createAuthHeaders('delete', url))
            .expect(200)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: true,
                ok: true,
              })

              expect(Item.delete).toHaveBeenCalledWith({ id: dbItem.id })
            })
        })
      })

      describe('and the item has a collection', () => {
        beforeEach(() => {
          mockExistsMiddleware(Item, dbItem.id)
          mockItemAuthorizationMiddleware(dbItem, wallet.address, false, true)
          ;(Item.findOne as jest.MockedFunction<
            typeof Item.findOne
          >).mockResolvedValueOnce(dbItem)
          ;(Collection.findOne as jest.MockedFunction<
            typeof Collection.findOne
          >).mockResolvedValueOnce(dbCollectionMock)
          ;(Collection.findByIds as jest.MockedFunction<
            typeof Collection.findByIds
          >).mockResolvedValueOnce([
            {
              ...dbCollectionMock,
              item_count: 1,
            },
          ])
        })

        describe('and its collection is already published', () => {
          beforeEach(() => {
            mockIsCollectionPublished(dbCollectionMock.id, true)
          })

          it('should respond with a 409 and a message signaling that the item is already published', () => {
            return server
              .delete(buildURL(url))
              .set(createAuthHeaders('delete', url))
              .expect(409)
              .then((response: any) => {
                expect(response.body).toEqual({
                  error:
                    "The collection that contains this item has been already published. The item can't be deleted.",
                  data: {
                    id: dbItem.id,
                    contract_address: dbCollectionMock.contract_address,
                  },
                  ok: false,
                })
              })
          })
        })
      })
    })

    describe('and the item is a third party item', () => {
      beforeEach(() => {
        url = `/items/${dbTPItem.id}`
      })
      describe('and the collection of the item is not part of a third party collection', () => {
        beforeEach(() => {
          mockExistsMiddleware(Item, dbTPItem.id)
          mockItemAuthorizationMiddleware(dbTPItem, wallet.address, true, true)
          ;(Item.findOne as jest.MockedFunction<
            typeof Item.findOne
          >).mockResolvedValueOnce(dbTPItem)
          ;(Collection.findByIds as jest.MockedFunction<
            typeof Collection.findByIds
          >).mockResolvedValueOnce([
            {
              ...dbCollectionMock,
              item_count: 1,
            },
          ])
        })

        it('should respond a 500, a message signaling that the third party item belongs to a non third party collection and not delete the item', () => {
          return server
            .delete(buildURL(url))
            .set(createAuthHeaders('delete', url))
            .expect(500)
            .then((response: any) => {
              expect(response.body).toEqual({
                error:
                  "The third party item does't belong to a third party collection",
                data: {
                  id: dbTPItem.id,
                },
                ok: false,
              })

              expect(Item.delete).not.toHaveBeenCalled()
            })
        })
      })

      describe('and the collection of the item is locked', () => {
        beforeEach(() => {
          mockExistsMiddleware(Item, dbTPItem.id)
          mockItemAuthorizationMiddleware(dbTPItem, wallet.address, true, true)
          ;(Item.findOne as jest.MockedFunction<
            typeof Item.findOne
          >).mockResolvedValueOnce(dbTPItem)
          const currentDate = Date.now()
          jest.spyOn(Date, 'now').mockReturnValueOnce(currentDate)
          ;(Collection.findByIds as jest.MockedFunction<
            typeof Collection.findByIds
          >).mockResolvedValueOnce([
            {
              ...dbTPCollectionMock,
              item_count: 1,
              lock: new Date(currentDate),
            },
          ])
        })

        afterEach(() => {
          ;(Date.now as jest.Mock).mockRestore()
        })

        it('should respond a 423, a message signaling that the collection is locked and not delete the item', () => {
          return server
            .delete(buildURL(url))
            .set(createAuthHeaders('delete', url))
            .expect(423)
            .then((response: any) => {
              expect(response.body).toEqual({
                error:
                  "The collection for the item is locked. The item can't be deleted.",
                data: {
                  id: dbTPItem.id,
                },
                ok: false,
              })

              expect(Item.delete).not.toHaveBeenCalled()
            })
        })
      })

      describe('and the item exists in the catalyst', () => {
        beforeEach(() => {
          mockExistsMiddleware(Item, dbTPItem.id)
          mockItemAuthorizationMiddleware(dbTPItem, wallet.address, true, true)
          ;(Item.findOne as jest.MockedFunction<
            typeof Item.findOne
          >).mockResolvedValueOnce(dbTPItem)
          ;(Collection.findByIds as jest.MockedFunction<
            typeof Collection.findByIds
          >).mockResolvedValueOnce([{ ...dbTPCollectionMock, item_count: 1 }])
          mockThirdPartyItemCurationExists(dbTPItem.id, true)
        })

        it('should respond a 409, a message signaling that the third party item is already published and not delete the item', () => {
          return server
            .delete(buildURL(url))
            .set(createAuthHeaders('delete', url))
            .expect(409)
            .then((response: any) => {
              expect(response.body).toEqual({
                error:
                  "The third party item is already published. It can't be deleted.",
                data: {
                  id: dbTPItem.id,
                  urn: buildTPItemURN(
                    dbTPCollectionMock.third_party_id,
                    dbTPCollectionMock.urn_suffix,
                    dbTPItem.urn_suffix!
                  ),
                },
                ok: false,
              })

              expect(Item.delete).not.toHaveBeenCalled()
            })
        })
      })

      describe("and the item doesn't exist in the catalayst and the third party collection is not locked", () => {
        beforeEach(() => {
          mockExistsMiddleware(Item, dbTPItem.id)
          mockItemAuthorizationMiddleware(dbTPItem, wallet.address, true, true)
          ;(Item.findOne as jest.MockedFunction<
            typeof Item.findOne
          >).mockResolvedValueOnce(dbTPItem)
          ;(Collection.findByIds as jest.MockedFunction<
            typeof Collection.findByIds
          >).mockResolvedValueOnce([{ ...dbTPCollectionMock, item_count: 1 }])
          mockThirdPartyItemCurationExists(dbTPItem.id, false)
        })

        it('should respond a 200 and delete the item', () => {
          return server
            .delete(buildURL(url))
            .set(createAuthHeaders('delete', url))
            .expect(200)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: true,
                ok: true,
              })

              expect(Item.delete).toHaveBeenCalledWith({
                id: dbTPItem.id,
              })
            })
        })
      })
    })
  })

  describe('when getting an item contents', () => {
    describe('and the item belongs to a published collection', () => {
      beforeEach(() => {
        dbItem.collection_id = dbCollectionMock.id
        dbItem.blockchain_item_id = '0'
        ;(Item.findByBlockchainIdsAndContractAddresses as jest.Mock).mockResolvedValueOnce(
          [dbItem]
        )
        ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
          dbCollectionMock
        )
        ;(collectionAPI.fetchCollectionWithItem as jest.Mock).mockResolvedValueOnce(
          { collection: itemFragment.collection, item: itemFragment }
        )
        ;(peerAPI.fetchItems as jest.Mock).mockResolvedValueOnce([wearable])
        resultingItem = toResultItem(dbItem, itemFragment, wearable)
        url = `/items/${dbCollectionMock.contract_address}/${dbItem.blockchain_item_id}/contents`
      })

      it('should return the item contents', async () => {
        return server
          .get(buildURL(url))
          .expect(200)
          .then((response: any) => {
            expect(collectionAPI.fetchCollectionWithItem).toHaveBeenCalledWith(
              dbCollectionMock.contract_address,
              `${dbCollectionMock.contract_address}-${dbItem.blockchain_item_id}`
            )
            expect(response.body).toEqual({
              data: {
                ...resultingItem.contents,
              },
              ok: true,
            })
            expect(
              Item.findByBlockchainIdsAndContractAddresses
            ).toHaveBeenCalledWith([
              {
                blockchainId: dbItem.blockchain_item_id,
                collectionAddress: dbCollectionMock.contract_address?.toLowerCase(),
              },
            ])
          })
      })

      describe('and the item is a smart wearable', () => {
        beforeEach(() => {
          dbItem.video = 'latestVideoHash'
          dbItem.contents = {
            ...dbItem.contents,
            'game.js': 'fileHash',
            [VIDEO_PATH]: 'oldHash',
          }

          resultingItem.contents = {
            ...dbItem.contents,
            [VIDEO_PATH]: 'latestVideoHash',
          }
        })

        it('should return the item contents using the hash of the item.video field', async () => {
          return server
            .get(buildURL(url))
            .expect(200)
            .then((response: any) => {
              expect(
                collectionAPI.fetchCollectionWithItem
              ).toHaveBeenCalledWith(
                dbCollectionMock.contract_address,
                `${dbCollectionMock.contract_address}-${dbItem.blockchain_item_id}`
              )
              expect(response.body).toEqual({
                data: {
                  ...resultingItem.contents,
                },
                ok: true,
              })
              expect(
                Item.findByBlockchainIdsAndContractAddresses
              ).toHaveBeenCalledWith([
                {
                  blockchainId: dbItem.blockchain_item_id,
                  collectionAddress: dbCollectionMock.contract_address?.toLowerCase(),
                },
              ])
            })
        })
      })
    })

    describe("and the item doesn't belong to a published collection", () => {
      beforeEach(() => {
        dbItem.collection_id = dbCollectionMock.id
        dbItem.blockchain_item_id = '1'
        ;(Item.findByBlockchainIdsAndContractAddresses as jest.Mock).mockResolvedValueOnce(
          []
        )
        resultingItem = toResultItem(dbItem)
        url = `/items/${dbCollectionMock.contract_address}/${dbItem.blockchain_item_id}/contents`
      })

      it('should return an error', async () => {
        return server
          .get(buildURL(url))
          .expect(200)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: {},
              error: "The item doesn't exist.",
              ok: false,
            })
            expect(
              Item.findByBlockchainIdsAndContractAddresses
            ).toHaveBeenCalledWith([
              {
                blockchainId: `${dbItem.blockchain_item_id}`,
                collectionAddress: dbCollectionMock.contract_address?.toLowerCase(),
              },
            ])
          })
      })
    })

    describe('and the collectionAddress is not a valid address', () => {
      it.each(['aCollectionAddress', '0xa', 'null'])(
        'should fail with a message indicating that the address is not valid',
        async (collectionAddress) => {
          url = `/items/${collectionAddress}/${dbItem.blockchain_item_id}/contents`
          return server
            .get(buildURL(url))
            .expect(400)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: {
                  contractAddress: collectionAddress.toLowerCase(),
                },
                error: `Invalid address ${collectionAddress.toLowerCase()}`,
                ok: false,
              })
            })
        }
      )
    })

    describe('and the blockchain itemId is not a valid address', () => {
      it.each(['aItemId', 'null', 'a'])(
        'should fail with a message indicating that the item id is not valid',
        async (blockchainItemId) => {
          url = `/items/${dbCollectionMock.contract_address}/${blockchainItemId}/contents`
          return server
            .get(buildURL(url))
            .expect(400)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: {
                  itemId: blockchainItemId.toLowerCase(),
                },
                error: `Invalid Item ID ${blockchainItemId.toLowerCase()}`,
                ok: false,
              })
            })
        }
      )
    })
  })

  describe('when getting the utility of a published item', () => {
    let url: string
    let contractAddress: string
    let blockchainItemId: string

    beforeEach(() => {
      contractAddress = '0x1234'
      blockchainItemId = '1'
      url = `/published-collections/${contractAddress}/items/${blockchainItemId}/utility`
    })

    describe('and the item is found', () => {
      let utility: string

      beforeEach(() => {
        utility = 'A utility'
        ;(Item.findByBlockchainIdsAndContractAddresses as jest.Mock).mockResolvedValueOnce(
          [{ ...dbItem, utility }]
        )
      })

      it('should respond with a 200 and the item utility', () => {
        return server
          .get(buildURL(url))
          .expect(200)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: { utility },
              ok: true,
            })
          })
      })
    })

    describe('and the item is not found', () => {
      beforeEach(() => {
        ;(Item.findByBlockchainIdsAndContractAddresses as jest.Mock).mockResolvedValueOnce(
          []
        )
      })

      it('should respond with a 404 status code', () => {
        return server
          .get(buildURL(url))
          .expect(404)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: { id: `${contractAddress}-${blockchainItemId}` },
              error: "The item doesn't exist.",
              ok: false,
            })
          })
      })
    })
  })
})
