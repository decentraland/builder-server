import supertest from 'supertest'
import { v4 as uuidv4 } from 'uuid'
import {
  wallet,
  createAuthHeaders,
  buildURL,
  mockExistsMiddleware,
  mockAuthorizationMiddleware,
} from '../../spec/utils'
import { collectionAttributesMock } from '../../spec/mocks/collections'
import {
  dbItemMock,
  itemFragmentMock,
  itemURNMock,
  ResultItem,
  toResultItem,
} from '../../spec/mocks/items'
import { isCommitteeMember } from '../Committee'
import { ExpressApp } from '../common/ExpressApp'
import { Ownable } from '../Ownable'
import { ItemRouter } from './Item.router'
import { app } from '../server'
import { Collection } from '../Collection/Collection.model'
import { collectionAPI } from '../ethereum/api/collection'
import { Item } from './Item.model'
import { hasAccess } from './access'
import { ItemAttributes, ItemRarity } from './Item.types'
import { peerAPI, Wearable } from '../ethereum/api/peer'
import { CollectionFragment, ItemFragment } from '../ethereum/api/fragments'

jest.mock('./Item.model')
jest.mock('../ethereum/api/collection')
jest.mock('../ethereum/api/peer')
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
    ;(urn = itemURNMock), (itemFragment = { ...itemFragmentMock })
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
      mockAuthorizationMiddleware(Item, dbItem.id, wallet.address)
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
})

// TODO: Refactor old testing into new kind of testing like 'Item router' above
describe('Item router (old)', () => {
  describe('when upserting an item', () => {
    const testCollectionId = 'ffb11be4-94f0-47a6-bf1c-6d77fbbea1d3'

    const testItem = {
      id: 'a8aca0ee-b3f6-4a8e-a78c-d8efeb099cd9',
      name: 'name',
      description: 'description',
      eth_address: 'eth_address',
      type: 'wearable',
      contents: {},
      created_at: 'created_at',
      updated_at: 'updated_at',
      metrics: {
        meshes: 1,
        bodies: 1,
        materials: 1,
        textures: 1,
        triangles: 1,
        entities: 1,
      },
      data: {
        replaces: ['eyebrows'],
        hides: ['eyebrows'],
        tags: ['tags'],
        representations: [
          {
            mainFile: 'mainFile',
            contents: ['contents'],
            overrideReplaces: ['eyebrows'],
            overrideHides: ['eyebrows'],
            bodyShapes: ['urn:decentraland:off-chain:base-avatars:BaseMale'],
          },
        ],
      },
    }

    const itemFindOneSpy = jest.spyOn(Item, 'findOne')
    const collectionFindOneSpy = jest.spyOn(Collection, 'findOne')
    const ownableCanUpsertSpy = jest.spyOn(Ownable.prototype, 'canUpsert')

    beforeAll(() => {
      ownableCanUpsertSpy.mockResolvedValue(true)
      itemFindOneSpy.mockResolvedValue(undefined)
      collectionFindOneSpy.mockResolvedValue(undefined)
    })

    const testError = (req: any, message: string) => {
      const app = new ExpressApp()
      const router = new ItemRouter(app)

      return expect(router.upsertItem(req)).rejects.toThrowError(message)
    }

    const testSuccess = (req: any) => {
      jest
        .spyOn(Item.prototype, 'upsert')
        .mockResolvedValueOnce({} as ItemAttributes)

      const app = new ExpressApp()
      const router = new ItemRouter(app)

      return expect(router.upsertItem(req)).resolves.toStrictEqual({
        content_hash: null,
        in_catalyst: false,
        is_approved: false,
        is_published: false,
        total_supply: 0,
        urn: null,
      })
    }

    const mockItemFindOne = (merge: any = {}) => {
      itemFindOneSpy.mockResolvedValueOnce({
        ...testItem,
        collection_id: testCollectionId,
        ...merge,
      })
    }

    const mockCollectionFindOne = (merge: any = {}) => {
      collectionFindOneSpy.mockResolvedValueOnce({
        collection_id: testCollectionId,
        eth_address: testItem.eth_address,
        ...merge,
      })
    }

    const mockIsCollectionPublished = () => {
      mockCollectionFindOne()

      jest
        .spyOn(collectionAPI, 'fetchCollectionWithItemsByContractAddress')
        .mockResolvedValueOnce({
          collection: {} as CollectionFragment,
          items: [{}] as ItemFragment[],
        })

      jest
        .spyOn(peerAPI, 'fetchWearables')
        .mockResolvedValueOnce([{}] as Wearable[])
    }

    describe('when param id is different from payload id', () => {
      it('should fail with body and url ids do not match message', async () => {
        await testError(
          {
            query: {
              id: 'id',
            },
            body: {
              item: {
                id: 'different id',
              },
            },
          },
          'The body and URL item ids do not match'
        )
      })
    })

    describe('when is_approved is sent in the payload', () => {
      it('should fail with cant set is_approved message', async () => {
        await testError(
          {
            query: {
              id: testItem.id,
            },
            body: {
              item: {
                ...testItem,
                is_approved: true,
              },
            },
            auth: {
              ethAddress: testItem.eth_address,
            },
          },
          'Can not change is_published or is_approved property'
        )
      })
    })

    describe('when is_published is sent in the payload', () => {
      it('should fail with cant set is_approved message', async () => {
        await testError(
          {
            query: {
              id: testItem.id,
            },
            body: {
              item: {
                ...testItem,
                is_published: true,
              },
            },
            auth: {
              ethAddress: testItem.eth_address,
            },
          },
          'Can not change is_published or is_approved property'
        )
      })
    })

    describe('when the user is unauthorized to upsert the item', () => {
      it('should fail with unauthorized user message', async () => {
        ownableCanUpsertSpy.mockResolvedValueOnce(false)

        await testError(
          {
            query: {
              id: testItem.id,
            },
            body: {
              item: testItem,
            },
            auth: {
              ethAddress: testItem.eth_address,
            },
          },
          'Unauthorized user'
        )
      })
    })

    describe('when the collection provided in the payload does not exists in the db', () => {
      it('should fail with collection not found message', async () => {
        await testError(
          {
            query: {
              id: testItem.id,
            },
            body: {
              item: { ...testItem, collection_id: testCollectionId },
            },
            auth: {
              ethAddress: testItem.eth_address,
            },
          },
          'Collection not found'
        )
      })
    })

    describe('when the collection provided in the payload does not belong to the address making the request', () => {
      it('should fail with unauthorized user message', async () => {
        mockCollectionFindOne({ eth_address: 'another address' })

        await testError(
          {
            query: {
              id: testItem.id,
            },
            body: {
              item: { ...testItem, collection_id: testCollectionId },
            },
            auth: {
              ethAddress: testItem.eth_address,
            },
          },
          'Unauthorized user'
        )
      })
    })

    describe('when the item collection is being changed', () => {
      it('should fail with cant change item collection message', async () => {
        const differentCollectionId = '6d3fd719-57c1-4436-bec3-7dd954c3fbfe'

        mockItemFindOne()

        await testError(
          {
            query: {
              id: testItem.id,
            },
            body: {
              item: {
                ...testItem,
                collection_id: differentCollectionId,
              },
            },
            auth: {
              ethAddress: testItem.eth_address,
            },
          },
          "Item can't change between collections"
        )
      })
    })

    describe('when the collection is published', () => {
      beforeEach(() => {
        mockIsCollectionPublished()
      })

      describe('when the item is being upserted for the first time', () => {
        it('should fail with can not add item to published collection message', async () => {
          await testError(
            {
              query: {
                id: testItem.id,
              },
              body: {
                item: {
                  ...testItem,
                  collection_id: testCollectionId,
                },
              },
              auth: {
                ethAddress: testItem.eth_address,
              },
            },
            "Items can't be added to a published collection"
          )
        })
      })

      describe('when the item is being removed from the collection', () => {
        it('should fail with can not remove item from published collection message', async () => {
          mockItemFindOne()

          await testError(
            {
              query: {
                id: testItem.id,
              },
              body: {
                item: testItem,
              },
              auth: {
                ethAddress: testItem.eth_address,
              },
            },
            "Items can't be removed from a pubished collection"
          )
        })
      })

      describe("when the item's rarity is being changed", () => {
        it('should fail with can not update items rarity message', async () => {
          const rarity1 = 'mythic'
          const rarity2 = 'unique'

          mockItemFindOne({ rarity: rarity1 })

          await testError(
            {
              query: {
                id: testItem.id,
              },
              body: {
                item: {
                  ...testItem,
                  rarity: rarity2,
                  collection_id: testCollectionId,
                },
              },
              auth: {
                ethAddress: testItem.eth_address,
              },
            },
            "An item rarity from a published collection can't be changed"
          )
        })
      })
    })

    describe('when everything is correct', () => {
      it('should resolve correctly', async () => {
        mockItemFindOne()
        mockIsCollectionPublished()

        await testSuccess({
          query: {
            id: testItem.id,
          },
          body: {
            item: {
              ...testItem,
              collection_id: testCollectionId,
            },
          },
          auth: {
            ethAddress: testItem.eth_address,
          },
        })
      })
    })
  })
})
