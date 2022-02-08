import supertest from 'supertest'
import { v4 as uuidv4 } from 'uuid'
import { constants, Wallet } from 'ethers'
import { utils } from 'decentraland-commons'
import {
  createAuthHeaders,
  buildURL,
  mockExistsMiddleware,
  mockOwnableCanUpsert,
  mockItemAuthorizationMiddleware,
  mockIsCollectionPublished,
  mockIsThirdPartyManager,
  mockThirdPartyItemExists,
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
} from '../../spec/mocks/items'
import { wallet } from '../../spec/mocks/wallet'
import { isCommitteeMember } from '../Committee'
import { app } from '../server'
import { Collection } from '../Collection/Collection.model'
import { collectionAPI } from '../ethereum/api/collection'
import { peerAPI, Wearable } from '../ethereum/api/peer'
import { ItemFragment } from '../ethereum/api/fragments'
import { STATUS_CODES } from '../common/HTTPError'
import { Bridge } from '../ethereum/api/Bridge'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import {
  CollectionAttributes,
  ThirdPartyCollectionAttributes,
} from '../Collection/Collection.types'
import { buildTPItemURN } from './utils'
import { hasPublicAccess } from './access'
import { Item } from './Item.model'
import {
  FullItem,
  ItemAttributes,
  ItemRarity,
  ThirdPartyItemAttributes,
} from './Item.types'

jest.mock('./Item.model')
jest.mock('../ethereum/api/collection')
jest.mock('../ethereum/api/peer')
jest.mock('../ethereum/api/thirdParty')
jest.mock('../utils/eth')
jest.mock('../Collection/Collection.model')
jest.mock('../Committee')
jest.mock('./access')

function mockItemConsolidation(
  itemsAttributes: ItemAttributes[],
  wearables: Wearable[]
) {
  ;(Item.findByBlockchainIdsAndContractAddresses as jest.Mock).mockResolvedValueOnce(
    itemsAttributes
  )
  ;(peerAPI.fetchWearables as jest.Mock).mockResolvedValueOnce(wearables)
  ;(collectionAPI.buildItemId as jest.Mock).mockImplementation(
    (contractAddress, tokenId) => contractAddress + '-' + tokenId
  )
  ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([dbCollectionMock])
}

const server = supertest(app.getApp())

describe('Item router', () => {
  let dbItem: ItemAttributes
  let dbItemNotPublished: ItemAttributes
  let resultItemNotPublished: ResultItem
  let resultingItem: ResultItem
  let wearable: Wearable
  let itemFragment: ItemFragment
  let urn: string
  let url: string

  beforeEach(() => {
    dbItem = { ...dbItemMock }
    urn = itemFragmentMock.urn
    itemFragment = { ...itemFragmentMock }
    wearable = {
      id: urn,
      name: dbItem.name,
      description: dbItem.description,
      collectionAddress: dbCollectionMock.contract_address!,
      rarity: ItemRarity.COMMON,
      image: '',
      thumbnail: '',
      metrics: dbItem.metrics,
      contents: {},
      data: {
        representations: [],
        replaces: [],
        hides: [],
        tags: [],
      },
      createdAt: dbItem.created_at.getTime(),
      updatedAt: dbItem.updated_at.getTime(),
    }
    dbItemNotPublished = {
      ...dbItem,
      id: uuidv4(),
      collection_id: dbCollectionMock.id,
      blockchain_item_id: null,
    }
    resultingItem = toResultItem(dbItem, itemFragment, wearable)
    resultItemNotPublished = toResultItem(dbItemNotPublished)
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
        ;(peerAPI.fetchWearables as jest.Mock).mockResolvedValueOnce([wearable])
        resultingItem = toResultItem(dbItem, itemFragment, wearable)
      })

      it('should return the requested item with its URN', () => {
        return server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(200)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: {
                ...resultingItem,
                beneficiary: itemFragment.beneficiary,
                collection_id: dbItem.collection_id,
                blockchain_item_id: dbItem.blockchain_item_id,
                urn,
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
    let dbTPItemNotPublishedUrn: string

    beforeEach(() => {
      dbTPItemNotPublishedMock = {
        ...dbTPItemMock,
        urn_suffix: '2',
      }

      dbTPItemNotPublishedUrn = buildTPItemURN(
        dbTPCollectionMock.third_party_id,
        dbTPCollectionMock.urn_suffix,
        dbTPItemNotPublishedMock.urn_suffix!
      )
      ;(isCommitteeMember as jest.Mock).mockResolvedValueOnce(true)
      ;(Item.find as jest.Mock).mockResolvedValueOnce([
        dbItem,
        dbTPItemMock,
        dbTPItemNotPublishedMock,
        dbItemNotPublished,
      ])
      ;(collectionAPI.fetchItems as jest.Mock).mockResolvedValueOnce([
        itemFragment,
      ])
      ;(thirdPartyAPI.fetchItems as jest.Mock).mockResolvedValueOnce([
        thirdPartyItemFragmentMock,
      ])
      ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
        dbTPCollectionMock,
      ]) // for third parties
      mockItemConsolidation([dbItem], [wearable])
      ;(peerAPI.fetchWearables as jest.Mock).mockResolvedValueOnce([wearable])
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
                collection_id: dbItem.collection_id,
                blockchain_item_id: dbItem.blockchain_item_id,
                urn,
              },
              resultItemNotPublished,
              {
                ...resultingItem,
                in_catalyst: false,
                is_approved: true,
                beneficiary: constants.AddressZero,
                price: '0',
                total_supply: 0,
                collection_id: dbTPItemMock.collection_id,
                blockchain_item_id: thirdPartyItemFragmentMock.blockchainItemId,
                urn: thirdPartyItemFragmentMock.urn,
              },
              {
                ...resultingItem,
                in_catalyst: false,
                is_approved: false,
                is_published: false,
                beneficiary: '',
                price: '',
                total_supply: 0,
                collection_id: dbTPItemNotPublishedMock.collection_id,
                blockchain_item_id: '0',
                urn: dbTPItemNotPublishedUrn,
              },
            ],
            ok: true,
          })
        })
    })
  })

  describe('when getting all the items of an address', () => {
    beforeEach(() => {
      ;(Item.find as jest.Mock).mockResolvedValueOnce([
        dbItem,
        dbItemNotPublished,
      ])
      ;(Item.findByThirdPartyIds as jest.Mock).mockResolvedValueOnce([
        dbTPItemMock,
      ])
      ;(thirdPartyAPI.fetchThirdPartiesByManager as jest.Mock).mockResolvedValueOnce(
        [thirdPartyFragmentMock]
      )
      ;(thirdPartyAPI.fetchItemsByThirdParties as jest.Mock).mockResolvedValueOnce(
        [thirdPartyItemFragmentMock]
      )
      ;(collectionAPI.fetchItemsByAuthorizedUser as jest.Mock).mockResolvedValueOnce(
        [itemFragment]
      )
      ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
        dbTPCollectionMock,
      ]) // for third parties
      ;(peerAPI.fetchWearables as jest.Mock).mockResolvedValueOnce([wearable])
      mockItemConsolidation([dbItem], [wearable])
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
                urn,
              },
              resultItemNotPublished,
              {
                ...resultingItem,
                in_catalyst: false,
                is_approved: true,
                beneficiary: constants.AddressZero,
                price: '0',
                total_supply: 0,
                collection_id: dbTPItemMock.collection_id,
                blockchain_item_id: thirdPartyItemFragmentMock.blockchainItemId,
                urn: thirdPartyItemFragmentMock.urn,
              },
            ],
            ok: true,
          })
        })
    })
  })

  describe('when getting all the items of a collection', () => {
    describe('and the collection is a DCL collection', () => {
      beforeEach(() => {
        ;(Item.find as jest.Mock).mockResolvedValueOnce([
          dbItemMock,
          dbItemNotPublished,
        ])
        ;(collectionAPI.fetchCollectionWithItemsByContractAddress as jest.Mock).mockResolvedValueOnce(
          { collection: itemFragment.collection, items: [itemFragment] }
        )
        ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
          dbCollectionMock
        )
        ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
          dbCollectionMock,
        ])
        mockItemConsolidation([dbItemMock], [wearable])
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
                  urn,
                },
                resultItemNotPublished,
              ],
              ok: true,
            })
          })
      })
    })

    describe('and the collection is a third party collection', () => {
      beforeEach(() => {
        ;(Item.find as jest.Mock).mockResolvedValueOnce([
          dbTPItemMock,
          dbItemNotPublished,
        ])
        ;(collectionAPI.fetchCollectionWithItemsByContractAddress as jest.Mock).mockResolvedValueOnce(
          { collection: itemFragment.collection, items: [itemFragment] }
        )
        ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
          dbTPCollectionMock
        )
        ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
          dbTPCollectionMock,
        ])
        ;(thirdPartyAPI.fetchLastItem as jest.Mock).mockResolvedValueOnce(
          thirdPartyItemFragmentMock
        )
        ;(thirdPartyAPI.fetchItemsByCollection as jest.Mock).mockResolvedValueOnce(
          [thirdPartyItemFragmentMock]
        )
        mockItemConsolidation([dbItemMock], [wearable])
        url = `/collections/${dbCollectionMock.id}/items`
      })

      it('should return all the items of a collection that are published with URN and the ones that are not without it', () => {
        return server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(200)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: [
                {
                  ...resultingItem,
                  in_catalyst: false,
                  is_approved: true,
                  beneficiary: constants.AddressZero,
                  total_supply: 0,
                  price: '0',
                  collection_id: dbTPItemMock.collection_id,
                  blockchain_item_id:
                    thirdPartyItemFragmentMock.blockchainItemId,
                  urn: thirdPartyItemFragmentMock.urn,
                },
                resultItemNotPublished,
              ],
              ok: true,
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
      itemToUpsert = utils.omit(dbItem, ['created_at', 'updated_at'])
      collectionMock = { ...dbCollectionMock }
      tpCollectionMock = { ...dbTPCollectionMock }
    })

    describe('and the item is a third party item', () => {
      const itemUrnSuffix = 'an-item-urn-suffix'

      beforeEach(() => {
        dbItem = { ...dbItem, blockchain_item_id: null }
      })

      describe('and the user upserting is not authorized to do so', () => {
        beforeEach(() => {
          itemToUpsert = { ...itemToUpsert, collection_id: tpCollectionMock.id }
          mockItem.findOne.mockResolvedValueOnce(itemToUpsert)
          mockCollection.findOne.mockResolvedValueOnce(tpCollectionMock)
          mockIsThirdPartyManager(wallet.address, false)
        })

        it('should respond with a 401 signaling that hte user is unauthorized to upsert the item in the collection', () => {
          return server
            .put(buildURL(url))
            .send({ item: itemToUpsert })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.unauthorized)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: { id: dbItem.id, eth_address: wallet.address },
                error: 'The user is unauthorized to upsert the collection.',
                ok: false,
              })
            })
        })
      })

      describe("and the item's urn is not valid", () => {
        beforeEach(() => {
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
                    dataPath: '/item/urn',
                    keyword: 'pattern',
                  }),
                ],
                error: 'Invalid request body',
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
          let dbItemURN: string

          beforeEach(() => {
            itemToUpsert = { ...itemToUpsert, collection_id: null }
            dbItem = { ...dbItem, collection_id: tpCollectionMock.id }
            dbItemURN = buildTPItemURN(
              tpCollectionMock.third_party_id,
              tpCollectionMock.urn_suffix,
              itemUrnSuffix
            )
            mockItem.findOne.mockResolvedValueOnce({
              ...dbItem,
              collection_id: tpCollectionMock.id,
              urn_suffix: itemUrnSuffix,
            })
            mockCollection.findOne.mockResolvedValueOnce(tpCollectionMock)
          })

          describe('and is not published', () => {
            let resultingItem: ResultItem

            beforeEach(() => {
              const updatedItem = {
                ...dbItem,
                urn_suffix: null,
                collection_id: null,
              }
              mockThirdPartyItemExists(dbItemURN, false)
              mockItem.prototype.upsert.mockResolvedValueOnce(updatedItem)
              resultingItem = toResultItem(
                updatedItem,
                undefined,
                undefined,
                tpCollectionMock
              )
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

          describe("and it's published", () => {
            beforeEach(() => {
              mockThirdPartyItemExists(dbItemURN, true)
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
                      urn: dbItemURN,
                    },
                    error:
                      "The third party item is already published. It can't be inserted or updated.",
                    ok: false,
                  })
                })
            })
          })
        })

        describe('and the update moves the item into the collection', () => {
          beforeEach(() => {
            mockItem.findOne.mockResolvedValueOnce({
              ...dbItem,
              collection_id: null,
              urn_suffix: null,
            })
            mockCollection.findOne.mockResolvedValueOnce(tpCollectionMock)
            itemToUpsert = {
              ...itemToUpsert,
              collection_id: tpCollectionMock.id,
            }
          })

          describe('and the new item has an urn', () => {
            let itemToUspertURN: string

            beforeEach(() => {
              itemToUspertURN = buildTPItemURN(
                tpCollectionMock.third_party_id,
                tpCollectionMock.urn_suffix,
                itemUrnSuffix
              )

              itemToUpsert = { ...itemToUpsert, urn: itemToUspertURN }
            })

            describe('and the URN already exists', () => {
              beforeEach(() => {
                mockThirdPartyItemExists(itemToUspertURN, true)
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
                        urn: itemToUspertURN,
                      },
                      error:
                        "The third party item is already published. It can't be inserted or updated.",
                      ok: false,
                    })
                  })
              })
            })

            describe("and the URN doesn't exist", () => {
              let resultingItem: ResultItem

              beforeEach(() => {
                const updatedItem = {
                  ...dbItem,
                  urn_suffix: itemUrnSuffix,
                  collection_id: tpCollectionMock.id,
                }
                mockThirdPartyItemExists(itemToUspertURN, false)
                mockItem.prototype.upsert.mockResolvedValueOnce(updatedItem)
                resultingItem = toResultItem(
                  updatedItem,
                  undefined,
                  undefined,
                  tpCollectionMock
                )
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

          describe("and the new item doesn't have an urn", () => {
            beforeEach(() => {
              itemToUpsert = { ...itemToUpsert, urn: null }
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

        describe("and the item's collection doesn't change", () => {
          let dbItemURN: string

          beforeEach(() => {
            dbItem = { ...dbItem, urn_suffix: itemUrnSuffix }
            dbItemURN = buildTPItemURN(
              tpCollectionMock.third_party_id,
              tpCollectionMock.urn_suffix,
              itemUrnSuffix
            )
            mockItem.findOne.mockResolvedValueOnce({
              ...dbItem,
              collection_id: tpCollectionMock.id,
              urn_suffix: itemUrnSuffix,
            })
            mockCollection.findOne.mockResolvedValueOnce(tpCollectionMock)
          })

          describe('and the URN changes', () => {
            beforeEach(() => {
              itemToUpsert = {
                ...itemToUpsert,
                collection_id: dbItem.collection_id,
                urn: buildTPItemURN(
                  tpCollectionMock.third_party_id,
                  tpCollectionMock.urn_suffix,
                  'some-other-item-urn-suffix'
                ),
              }
            })

            describe('and the item is already published', () => {
              beforeEach(() => {
                mockThirdPartyItemExists(dbItemURN, true)
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
                        urn: dbItemURN,
                      },
                      error:
                        "The third party item is already published. It can't be inserted or updated.",
                      ok: false,
                    })
                  })
              })
            })

            describe('and the item is not published but the new URN is already in use', () => {
              beforeEach(() => {
                mockThirdPartyItemExists(dbItemURN, false)
                mockThirdPartyItemExists(itemToUpsert.urn!, true)
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
                        "The third party item is already published. It can't be inserted or updated.",
                      ok: false,
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
                collection_id: dbItem.collection_id,
                urn: dbItemURN,
              }

              const updatedItem = {
                ...dbItem,
                urn_suffix: itemUrnSuffix,
                collection_id: tpCollectionMock.id,
              }
              mockItem.prototype.upsert.mockResolvedValueOnce(updatedItem)
              resultingItem = toResultItem(
                updatedItem,
                undefined,
                undefined,
                tpCollectionMock
              )
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
      })

      describe('and the item is being inserted', () => {
        beforeEach(() => {
          mockItem.findOne.mockResolvedValueOnce(undefined)
          mockCollection.findOne.mockResolvedValueOnce(tpCollectionMock)
          mockIsThirdPartyManager(wallet.address, true)
        })

        describe('and the item to insert has an URN', () => {
          beforeEach(() => {
            itemToUpsert = {
              ...itemToUpsert,
              collection_id: tpCollectionMock.id,
              urn: buildTPItemURN(
                tpCollectionMock.third_party_id,
                tpCollectionMock.urn_suffix,
                'some-item-urn-suffix'
              ),
            }
          })

          describe('and the URN is already in use', () => {
            beforeEach(() => {
              mockThirdPartyItemExists(itemToUpsert.urn!, true)
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
                      "The third party item is already published. It can't be inserted or updated.",
                    ok: false,
                  })
                })
            })
          })

          describe('and the URN is not in use', () => {
            let resultingItem: ResultItem

            beforeEach(() => {
              const updatedItem = {
                ...dbItem,
                urn_suffix: itemUrnSuffix,
                collection_id: tpCollectionMock.id,
              }
              mockThirdPartyItemExists(itemToUpsert.urn!, false)
              mockItem.prototype.upsert.mockResolvedValueOnce(updatedItem)
              resultingItem = toResultItem(
                updatedItem,
                undefined,
                undefined,
                tpCollectionMock
              )
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

    describe('and the item is a DCL item', () => {
      beforeEach(() => {
        itemToUpsert = { ...itemToUpsert, urn: null }
      })

      describe('and the item inserted has an invalid name', () => {
        it("should fail with a message indicating that the name doesn't match the pattern", () => {
          return server
            .put(buildURL(url))
            .send({ item: { ...itemToUpsert, name: 'anInvalid:name' } })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.badRequest)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: [
                  {
                    dataPath: '/item/name',
                    keyword: 'pattern',
                    message: 'should match pattern "^[^:]*$"',
                    params: { pattern: '^[^:]*$' },
                    schemaPath: '#/properties/item/properties/name/pattern',
                  },
                ],
                error: 'Invalid request body',
                ok: false,
              })
            })
        })
      })

      describe('and the item inserted has an invalid description', () => {
        it("should fail with a message indicating that the description doesn't match the pattern", () => {
          return server
            .put(buildURL(url))
            .send({
              item: { ...itemToUpsert, description: 'anInvalid:nescription' },
            })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.badRequest)
            .then((response: any) => {
              expect(response.body).toEqual({
                data: [
                  {
                    dataPath: '/item/description',
                    keyword: 'pattern',
                    message: 'should match pattern "^[^:]*$"',
                    params: { pattern: '^[^:]*$' },
                    schemaPath:
                      '#/properties/item/properties/description/pattern',
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
            error: 'The body and URL item ids do not match',
            ok: false,
          })
        })
      })

      describe('and the item is being inserted', () => {
        beforeEach(() => {
          itemToUpsert = { ...itemToUpsert, collection_id: null }
          mockItem.findOne.mockResolvedValueOnce(itemToUpsert)
          mockCollection.findOne.mockResolvedValueOnce(undefined)
          mockOwnableCanUpsert(Item, itemToUpsert.id, wallet.address, false)
        })

        it('should fail with unauthorized user message', async () => {
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

      describe('and the collection provided in the payload does not exists in the db', () => {
        beforeEach(() => {
          mockItem.findOne.mockResolvedValueOnce(itemToUpsert)
          mockCollection.findOne.mockResolvedValueOnce(undefined)
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
          mockCollection.findOne.mockResolvedValueOnce({
            ...collectionMock,
            collection_id: dbItem.collection_id,
            eth_address: differentEthAddress,
          })
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
            error:
              "The new collection for the item isn't owned by the same owner.",
            ok: false,
          })
        })
      })

      describe('and the collection of the item is being changed', () => {
        beforeEach(() => {
          mockItem.findOne.mockResolvedValueOnce(itemToUpsert)
          mockCollection.findOne.mockResolvedValueOnce({
            ...collectionMock,
            collection_id: itemToUpsert.collection_id,
            eth_address: wallet.address,
          })
          mockOwnableCanUpsert(Item, itemToUpsert.id, wallet.address, true)
        })

        it('should fail with cant change item collection message', async () => {
          const response = await server
            .put(buildURL(url))
            .send({ item: { ...itemToUpsert, collection_id: mockUUID } })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.unauthorized)

          expect(response.body).toEqual({
            data: { id: dbItem.id },
            error: "Item can't change between collections.",
            ok: false,
          })
        })
      })

      describe('when the collection given for the item is locked', () => {
        beforeEach(() => {
          mockCollection.findOne.mockResolvedValueOnce({
            ...collectionMock,
            collection_id: itemToUpsert.collection_id,
            eth_address: wallet.address,
            contract_address: Wallet.createRandom().address,
            lock: new Date(),
          })
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
          mockCollection.findOne.mockResolvedValueOnce({
            ...collectionMock,
            collection_id: itemToUpsert.collection_id,
            eth_address: wallet.address,
            contract_address: Wallet.createRandom().address,
          })
          mockOwnableCanUpsert(Item, itemToUpsert.id, wallet.address, true)
          mockIsCollectionPublished(collectionMock.id, true)
        })

        describe('and the item is being inserted', () => {
          beforeEach(() => {
            mockItem.findOne.mockResolvedValueOnce(undefined)
          })

          it('should fail with can not add item to published collection message', async () => {
            const response = await server
              .put(buildURL(url))
              .send({ item: itemToUpsert })
              .set(createAuthHeaders('put', url))
              .expect(STATUS_CODES.conflict)

            expect(mockItem.findOne).toHaveBeenCalledTimes(1)
            expect(mockCollection.findOne).toHaveBeenCalledTimes(1)

            expect(response.body).toEqual({
              data: { id: itemToUpsert.id },
              error:
                "The collection that contains this item has been already published. The item can't be inserted.",
              ok: false,
            })
          })
        })

        describe('and the item is being removed from the collection', () => {
          beforeEach(() => {
            mockItem.findOne.mockResolvedValueOnce(itemToUpsert)
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
          })

          it('should fail with can not update items rarity message', async () => {
            const response = await server
              .put(buildURL(url))
              .send({ item: { ...itemToUpsert, rarity: ItemRarity.EPIC } })
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
      })

      describe('and all the conditions for success are given', () => {
        beforeEach(() => {
          mockCollection.findOne.mockResolvedValueOnce({
            ...collectionMock,
            collection_id: itemToUpsert.collection_id,
            eth_address: wallet.address,
            contract_address: Wallet.createRandom().address,
          })
          mockItem.findOne.mockResolvedValueOnce(undefined)
          mockOwnableCanUpsert(Item, itemToUpsert.id, wallet.address, true)
          mockIsCollectionPublished(collectionMock.id, false)
          mockItem.prototype.upsert.mockResolvedValueOnce(dbItem)
        })

        it('should respond with the upserted item', async () => {
          const response = await server
            .put(buildURL(url))
            .send({ item: itemToUpsert })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.ok)

          expect(response.body).toEqual({
            data: JSON.parse(JSON.stringify(Bridge.toFullItem(dbItem))),
            ok: true,
          })
        })
      })
    })
  })

  describe('when deleting an item', () => {
    let collectionMock: CollectionAttributes

    beforeEach(() => {
      url = `/items/${dbItem.id}`
      collectionMock = { ...collectionMock }
    })

    describe('and the item is a DCL item', () => {
      describe('and the user is not authorized', () => {
        beforeEach(() => {
          mockExistsMiddleware(Item, dbItem.id)
          mockItemAuthorizationMiddleware(
            dbItem.id,
            wallet.address,
            false,
            false
          )
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
          mockExistsMiddleware(Item, dbItem.id)
          mockItemAuthorizationMiddleware(
            dbItem.id,
            wallet.address,
            false,
            true
          )
          ;(Item.findOne as jest.MockedFunction<
            typeof Item.findOne
          >).mockResolvedValueOnce({ ...dbItem, collection_id: null })
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
          mockItemAuthorizationMiddleware(
            dbItem.id,
            wallet.address,
            false,
            true
          )
          ;(Item.findOne as jest.MockedFunction<
            typeof Item.findOne
          >).mockResolvedValueOnce(dbItem)
          ;(Collection.findOne as jest.MockedFunction<
            typeof Collection.findOne
          >).mockResolvedValueOnce(dbCollectionMock)
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
      describe('and the collection of the item is not part of a third party collection', () => {
        beforeEach(() => {
          mockExistsMiddleware(Item, dbTPItemMock.id)
          mockItemAuthorizationMiddleware(
            dbTPItemMock.id,
            wallet.address,
            true,
            true
          )
          ;(Item.findOne as jest.MockedFunction<
            typeof Item.findOne
          >).mockResolvedValueOnce(dbTPItemMock)
          ;(Collection.findOne as jest.MockedFunction<
            typeof Collection.findOne
          >).mockResolvedValueOnce(dbCollectionMock)
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
                  id: dbTPItemMock.id,
                },
                ok: false,
              })

              expect(Item.delete).not.toHaveBeenCalled()
            })
        })
      })

      describe('and the collection of the item is locked', () => {
        beforeEach(() => {
          mockExistsMiddleware(Item, dbTPItemMock.id)
          mockItemAuthorizationMiddleware(
            dbTPItemMock.id,
            wallet.address,
            true,
            true
          )
          ;(Item.findOne as jest.MockedFunction<
            typeof Item.findOne
          >).mockResolvedValueOnce(dbTPItemMock)
          const currentDate = Date.now()
          jest.spyOn(Date, 'now').mockReturnValueOnce(currentDate)
          ;(Collection.findOne as jest.MockedFunction<
            typeof Collection.findOne
          >).mockResolvedValueOnce({
            ...dbTPCollectionMock,
            lock: new Date(currentDate),
          })
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
                  id: dbTPItemMock.id,
                },
                ok: false,
              })

              expect(Item.delete).not.toHaveBeenCalled()
            })
        })
      })

      describe('and the item exists in the blockchain', () => {
        beforeEach(() => {
          mockExistsMiddleware(Item, dbTPItemMock.id)
          mockItemAuthorizationMiddleware(
            dbTPItemMock.id,
            wallet.address,
            true,
            true
          )
          ;(Item.findOne as jest.MockedFunction<
            typeof Item.findOne
          >).mockResolvedValueOnce(dbTPItemMock)
          ;(Collection.findOne as jest.MockedFunction<
            typeof Collection.findOne
          >).mockResolvedValueOnce(dbTPCollectionMock)
          ;(thirdPartyAPI.itemExists as jest.MockedFunction<
            typeof thirdPartyAPI.itemExists
          >).mockResolvedValueOnce(true)
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
                  id: dbTPItemMock.id,
                  urn: buildTPItemURN(
                    dbTPCollectionMock.third_party_id,
                    dbTPCollectionMock.urn_suffix,
                    dbTPItemMock.urn_suffix
                  ),
                },
                ok: false,
              })

              expect(Item.delete).not.toHaveBeenCalled()
            })
        })
      })

      describe("and the item doesn't exist in the blockchain and the third party collection is not locked", () => {
        beforeEach(() => {
          mockExistsMiddleware(Item, dbTPItemMock.id)
          mockItemAuthorizationMiddleware(
            dbTPItemMock.id,
            wallet.address,
            true,
            true
          )
          ;(Item.findOne as jest.MockedFunction<
            typeof Item.findOne
          >).mockResolvedValueOnce(dbTPItemMock)
          ;(Collection.findOne as jest.MockedFunction<
            typeof Collection.findOne
          >).mockResolvedValueOnce(dbTPCollectionMock)
          ;(thirdPartyAPI.itemExists as jest.MockedFunction<
            typeof thirdPartyAPI.itemExists
          >).mockResolvedValueOnce(false)
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
                id: dbTPItemMock.id,
              })
            })
        })
      })
    })
  })
})
