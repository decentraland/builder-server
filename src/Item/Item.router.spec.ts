import supertest from 'supertest'
import { v4 as uuidv4 } from 'uuid'
import { Wallet } from 'ethers'
import {
  createAuthHeaders,
  buildURL,
  mockExistsMiddleware,
  mockOwnableCanUpsert,
  mockItemAuthorizationMiddleware,
  mockIsCollectionPublished,
} from '../../spec/utils'
import { collectionAttributesMock } from '../../spec/mocks/collections'
import {
  dbItemMock,
  itemFragmentMock,
  itemURNMock,
  ResultItem,
  toResultItem,
} from '../../spec/mocks/items'
import { wallet } from '../../spec/mocks/wallet'
import { isCommitteeMember } from '../Committee'
import { app } from '../server'
import { Collection } from '../Collection/Collection.model'
import { collectionAPI } from '../ethereum/api/collection'
import { Item } from './Item.model'
import { hasAccess } from './access'
import { ItemAttributes, ItemRarity } from './Item.types'
import { peerAPI, Wearable } from '../ethereum/api/peer'
import { CollectionFragment, ItemFragment } from '../ethereum/api/fragments'
import { STATUS_CODES } from '../common/HTTPError'
import { Bridge } from '../ethereum/api/Bridge'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { buildTPItemURN } from './utils'

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
  ;(Collection.findByIds as jest.Mock).mockResolvedValueOnce([
    collectionAttributesMock,
  ])
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
    urn = itemURNMock
    itemFragment = { ...itemFragmentMock }
    wearable = {
      id: urn,
      name: dbItem.name,
      description: dbItem.description,
      collectionAddress: collectionAttributesMock.contract_address!,
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
      collection_id: collectionAttributesMock.id,
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
      ;(hasAccess as jest.Mock).mockResolvedValueOnce(true)
      ;(Item.findOne as jest.Mock).mockResolvedValueOnce(dbItem)
      url = `/items/${dbItem.id}`
    })

    describe('when the item belongs to a published collection', () => {
      beforeEach(() => {
        dbItem.collection_id = collectionAttributesMock.id
        dbItem.blockchain_item_id = '0'
        ;(Collection.findOne as jest.Mock).mockResolvedValueOnce(
          collectionAttributesMock
        )
        ;(collectionAPI.fetchItem as jest.Mock).mockResolvedValueOnce(
          itemFragment
        )
        ;(collectionAPI.fetchCollection as jest.Mock).mockResolvedValueOnce(
          itemFragment.collection
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
    beforeEach(() => {
      ;(isCommitteeMember as jest.Mock).mockResolvedValueOnce(true)
      ;(Item.find as jest.Mock).mockResolvedValueOnce([
        dbItem,
        dbItemNotPublished,
      ])
      ;(collectionAPI.fetchItems as jest.Mock).mockResolvedValueOnce([
        itemFragment,
      ])
      mockItemConsolidation([dbItem], [wearable])
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
      ;(collectionAPI.fetchItemsByAuthorizedUser as jest.Mock).mockResolvedValueOnce(
        [itemFragment]
      )
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
            ],
            ok: true,
          })
        })
    })
  })

  describe('when getting all the items of a collection', () => {
    beforeEach(() => {
      ;(Item.find as jest.Mock).mockResolvedValueOnce([
        dbItem,
        dbItemNotPublished,
      ])
      ;(hasAccess as jest.Mock).mockResolvedValueOnce(true)
      ;(collectionAPI.fetchCollectionWithItemsByContractAddress as jest.Mock).mockResolvedValueOnce(
        { collection: itemFragment.collection, items: [itemFragment] }
      )
      ;(Collection.findOne as jest.Mock).mockResolvedValueOnce([
        collectionAttributesMock,
      ])
      mockItemConsolidation([dbItem], [wearable])
      url = `/collections/${collectionAttributesMock.id}/items`
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

  describe('when upserting an item', () => {
    const mockCollection = Collection as jest.Mocked<typeof Collection>
    const mockPeer = peerAPI as jest.Mocked<typeof peerAPI>
    const mockCollectionApi = collectionAPI as jest.Mocked<typeof collectionAPI>
    const mockItem = Item as jest.MockedClass<typeof Item> &
      jest.Mocked<typeof Item>

    const mockUUID = '75e7da02-a727-48de-a4da-d0778395067b'

    beforeEach(() => {
      url = `/items/${dbItem.id}`
    })

    describe('and the param id is different from payload id', () => {
      it('should fail with body and url ids do not match message', async () => {
        const response = await server
          .put(buildURL(url))
          .send({ item: { ...dbItem, id: mockUUID } })
          .set(createAuthHeaders('put', url))
          .expect(STATUS_CODES.badRequest)

        expect(response.body).toEqual({
          data: { bodyId: mockUUID, urlId: dbItem.id },
          error: 'The body and URL item ids do not match',
          ok: false,
        })
      })
    })

    describe('and is_approved or is_published exist in the payload item', () => {
      const testProperty = async (prop: 'is_published' | 'is_approved') => {
        const response = await server
          .put(buildURL(url))
          .send({ item: { ...dbItem, [prop]: true } })
          .set(createAuthHeaders('put', url))
          .expect(STATUS_CODES.unauthorized)

        expect(response.body).toEqual({
          data: { id: dbItem.id, eth_address: wallet.address },
          error: 'Can not change is_published or is_approved property',
          ok: false,
        })
      }

      describe('having is_approved present', () => {
        it('should fail with with cant set is approved or is published message', async () => {
          testProperty('is_approved')
        })
      })

      describe('having is_published present', () => {
        it('should fail with with cant set is approved or is published message', async () => {
          testProperty('is_published')
        })
      })
    })

    describe('and the user upserting is not authorized to do so', () => {
      beforeEach(() => {
        mockOwnableCanUpsert(Item, dbItem.id, wallet.address, false)
      })
      it('should fail with unauthorized user message', async () => {
        const response = await server
          .put(buildURL(url))
          .send({ item: dbItem })
          .set(createAuthHeaders('put', url))
          .expect(STATUS_CODES.unauthorized)

        expect(response.body).toEqual({
          data: { id: dbItem.id, eth_address: wallet.address },
          error: 'Unauthorized user',
          ok: false,
        })
      })
    })

    describe('and the collection provided in the payload does not exists in the db', () => {
      beforeEach(() => {
        mockOwnableCanUpsert(Item, dbItem.id, wallet.address, true)
      })

      it('should fail with collection not found message', async () => {
        const response = await server
          .put(buildURL(url))
          .send({ item: dbItem })
          .set(createAuthHeaders('put', url))
          .expect(STATUS_CODES.notFound)

        expect(response.body).toEqual({
          data: { collectionId: dbItem.collection_id },
          error: 'Collection not found',
          ok: false,
        })
      })
    })

    describe('and the collection provided in the payload does not belong to the address making the request', () => {
      const differentEthAddress = '0xc6d2000a7a1ddca92941f4e2b41360fe4ee2abd8'
      beforeEach(() => {
        mockOwnableCanUpsert(Item, dbItem.id, wallet.address, true)
        mockCollection.findOne.mockResolvedValueOnce({
          collection_id: dbItem.collection_id,
          eth_address: differentEthAddress,
        })
      })

      it('should fail with unauthorized user message', async () => {
        const response = await server
          .put(buildURL(url))
          .send({ item: dbItem })
          .set(createAuthHeaders('put', url))
          .expect(STATUS_CODES.unauthorized)

        expect(response.body).toEqual({
          data: {
            id: dbItem.id,
            eth_address: wallet.address,
            collection_id: dbItem.collection_id,
          },
          error: 'Unauthorized user',
          ok: false,
        })
      })
    })

    describe('and the collection of the item is being changed', () => {
      beforeEach(() => {
        mockOwnableCanUpsert(Item, dbItem.id, wallet.address, true)
      })

      it('should fail with cant change item collection message', async () => {
        mockItem.findOne.mockResolvedValueOnce(dbItem)
        mockCollection.findOne.mockResolvedValueOnce({
          collection_id: dbItem.collection_id,
          eth_address: wallet.address,
        })

        const response = await server
          .put(buildURL(url))
          .send({ item: { ...dbItem, collection_id: mockUUID } })
          .set(createAuthHeaders('put', url))
          .expect(STATUS_CODES.unauthorized)

        expect(response.body).toEqual({
          data: { id: dbItem.id },
          error: "Item can't change between collections",
          ok: false,
        })
      })
    })

    describe('when the collection given for the item is locked', () => {
      beforeEach(() => {
        mockOwnableCanUpsert(Item, dbItem.id, wallet.address, true)
        mockPeer.fetchWearables.mockResolvedValueOnce([{}] as Wearable[])
        mockCollection.findOne.mockResolvedValueOnce({
          collection_id: dbItem.collection_id,
          eth_address: wallet.address,
          contract_address: Wallet.createRandom().address,
          lock: new Date(),
        })
        mockIsCollectionPublished(collectionAttributesMock.id, false)
      })

      describe('and the item is being changed', () => {
        beforeEach(() => {
          mockItem.findOne.mockResolvedValueOnce(dbItem)
        })

        it('should fail with can not update locked collection items message', async () => {
          const response = await server
            .put(buildURL(url))
            .send({ item: { ...dbItem, name: 'new name' } })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.locked)

          expect(response.body).toEqual({
            data: {
              id: dbItem.id,
            },
            error: "Locked collection items can't be updated",
            ok: false,
          })
        })
      })
    })

    describe('when the collection given for the item is already published', () => {
      beforeEach(() => {
        mockOwnableCanUpsert(Item, dbItem.id, wallet.address, true)
        mockPeer.fetchWearables.mockResolvedValueOnce([{}] as Wearable[])
        mockCollection.findOne.mockResolvedValueOnce({
          collection_id: dbItem.collection_id,
          eth_address: wallet.address,
          contract_address: Wallet.createRandom().address,
        })

        mockCollectionApi.fetchCollection.mockResolvedValueOnce(
          {} as CollectionFragment
        )
      })

      describe('and the item is being upserted for the first time', () => {
        it('should fail with can not add item to published collection message', async () => {
          const response = await server
            .put(buildURL(url))
            .send({ item: dbItem })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.badRequest)

          expect(response.body).toEqual({
            data: { id: dbItem.id },
            error: "Items can't be added to a published collection",
            ok: false,
          })
        })
      })

      describe('and the item is being removed from the collection', () => {
        beforeEach(() => {
          mockItem.findOne.mockResolvedValueOnce(dbItem)
        })

        it('should fail with can not remove item from published collection message', async () => {
          const response = await server
            .put(buildURL(url))
            .send({ item: { ...dbItem, collection_id: null } })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.badRequest)

          expect(response.body).toEqual({
            data: { id: dbItem.id },
            error: "Items can't be removed from a pubished collection",
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
            .send({ item: { ...dbItem, rarity: ItemRarity.EPIC } })
            .set(createAuthHeaders('put', url))
            .expect(STATUS_CODES.badRequest)

          expect(response.body).toEqual({
            data: {
              id: dbItem.id,
              current: dbItem.rarity,
              other: ItemRarity.EPIC,
            },
            error:
              "An item rarity from a published collection can't be changed",
            ok: false,
          })
        })
      })
    })

    describe('and all the conditions for success are given', () => {
      beforeEach(() => {
        mockOwnableCanUpsert(Item, dbItem.id, wallet.address, true)
        mockPeer.fetchWearables.mockResolvedValueOnce([] as Wearable[])
        mockCollection.findOne.mockResolvedValueOnce({
          collection_id: dbItem.collection_id,
          eth_address: wallet.address,
          contract_address: Wallet.createRandom().address,
        })

        mockIsCollectionPublished(collectionAttributesMock.id, false)
        mockItem.prototype.upsert.mockResolvedValueOnce(dbItem)
      })

      it('should respond with the upserted item', async () => {
        const response = await server
          .put(buildURL(url))
          .send({ item: dbItem })
          .set(createAuthHeaders('put', url))
          .expect(STATUS_CODES.ok)

        expect(response.body).toEqual({
          data: JSON.parse(JSON.stringify(Bridge.toFullItem(dbItem))),
          ok: true,
        })
      })
    })
  })

  describe('when deleting an item', () => {
    beforeEach(() => {
      url = `/items/${dbItem.id}`
    })

    describe('and the item is a DCL item', () => {
      beforeEach(() => {
        dbItem.urn_suffix = null
        collectionAttributesMock.urn_suffix = null
        collectionAttributesMock.third_party_id = null
      })

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
                data: { ethAddress: wallet.address, tableName: Item.tableName },
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
          >).mockResolvedValueOnce(collectionAttributesMock)
        })

        describe('and its collection is already published', () => {
          beforeEach(() => {
            mockIsCollectionPublished(collectionAttributesMock.id, true)
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
                    blockchain_item_id: dbItem.blockchain_item_id,
                    contract_address: collectionAttributesMock.contract_address,
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
        dbItem.urn_suffix = '0'
        collectionAttributesMock.urn_suffix = 'collection-id'
        collectionAttributesMock.third_party_id = 'third-party-id'
      })

      describe("and the item in the db doesn't have a collection id assigned to it", () => {
        beforeEach(() => {
          dbItem.collection_id = null
          mockExistsMiddleware(Item, dbItem.id)
          mockItemAuthorizationMiddleware(dbItem.id, wallet.address, true, true)
          ;(Item.findOne as jest.MockedFunction<
            typeof Item.findOne
          >).mockResolvedValueOnce(dbItem)
        })

        it('should respond a 500, a message signaling that the third party item is not part of a collection and not delete the item', () => {
          return server
            .delete(buildURL(url))
            .set(createAuthHeaders('delete', url))
            .expect(500)
            .then((response: any) => {
              expect(response.body).toEqual({
                error: "The third party item isn't part of a collection",
                data: {
                  id: dbItem.id,
                },
                ok: false,
              })

              expect(Item.delete).not.toHaveBeenCalled()
            })
        })
      })

      describe('and the collection of the item is not part of a third party collection', () => {
        beforeEach(() => {
          collectionAttributesMock.urn_suffix = null
          collectionAttributesMock.third_party_id = null
          mockExistsMiddleware(Item, dbItem.id)
          mockItemAuthorizationMiddleware(dbItem.id, wallet.address, true, true)
          ;(Item.findOne as jest.MockedFunction<
            typeof Item.findOne
          >).mockResolvedValueOnce(dbItem)
          ;(Collection.findOne as jest.MockedFunction<
            typeof Collection.findOne
          >).mockResolvedValueOnce(collectionAttributesMock)
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
                  id: dbItem.id,
                },
                ok: false,
              })

              expect(Item.delete).not.toHaveBeenCalled()
            })
        })
      })

      describe('and the collection of the item is locked', () => {
        beforeEach(() => {
          mockExistsMiddleware(Item, dbItem.id)
          mockItemAuthorizationMiddleware(dbItem.id, wallet.address, true, true)
          ;(Item.findOne as jest.MockedFunction<
            typeof Item.findOne
          >).mockResolvedValueOnce(dbItem)
          const currentDate = Date.now()
          jest.spyOn(Date, 'now').mockReturnValueOnce(currentDate)
          ;(Collection.findOne as jest.MockedFunction<
            typeof Collection.findOne
          >).mockResolvedValueOnce({
            ...collectionAttributesMock,
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
                  id: dbItem.id,
                },
                ok: false,
              })

              expect(Item.delete).not.toHaveBeenCalled()
            })
        })
      })

      describe('and the item exists in the blockchain', () => {
        beforeEach(() => {
          mockExistsMiddleware(Item, dbItem.id)
          mockItemAuthorizationMiddleware(dbItem.id, wallet.address, true, true)
          ;(Item.findOne as jest.MockedFunction<
            typeof Item.findOne
          >).mockResolvedValueOnce(dbItem)
          ;(Collection.findOne as jest.MockedFunction<
            typeof Collection.findOne
          >).mockResolvedValueOnce(collectionAttributesMock)
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
                  id: dbItem.id,
                  urn: buildTPItemURN(
                    collectionAttributesMock.third_party_id!,
                    collectionAttributesMock.urn_suffix!,
                    dbItem.urn_suffix!
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
          mockExistsMiddleware(Item, dbItem.id)
          mockItemAuthorizationMiddleware(dbItem.id, wallet.address, true, true)
          ;(Item.findOne as jest.MockedFunction<
            typeof Item.findOne
          >).mockResolvedValueOnce(dbItem)
          ;(Collection.findOne as jest.MockedFunction<
            typeof Collection.findOne
          >).mockResolvedValueOnce(collectionAttributesMock)
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

              expect(Item.delete).toHaveBeenCalledWith({ id: dbItem.id })
            })
        })
      })
    })
  })
})
