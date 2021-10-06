import supertest from 'supertest'
import { v4 as uuidv4 } from 'uuid'
import {
  wallet,
  createAuthHeaders,
  buildURL,
  mockExistsMiddleware,
  mockAuthorizationMiddleware,
  collectionAttributesMock,
} from '../../spec/utils'
import { isCommitteeMember } from '../Committee'
import { app } from '../server'
import { Collection } from '../Collection/Collection.model'
import { collectionAPI } from '../ethereum/api/collection'
import { Item } from './Item.model'
import { hasAccess } from './access'
import { FullItem, ItemAttributes, ItemType } from './Item.types'
import { peerAPI, Wearable } from '../ethereum/api/peer'
import { ItemFragment } from '../ethereum/api/fragments'
import { ItemRarity } from '.'

type ResultItem = Omit<FullItem, 'created_at' | 'updated_at'> & {
  created_at: string
  updated_at: string
}

function toResultItem(
  itemAttributes: ItemAttributes,
  itemFragment?: ItemFragment,
  catalystItem?: Wearable
): ResultItem {
  const resultItem = {
    ...itemAttributes,
    created_at: itemAttributes.created_at.toISOString(),
    updated_at: itemAttributes.updated_at.toISOString(),
    in_catalyst: Boolean(catalystItem),
    is_approved: false,
    is_published:
      Boolean(itemAttributes.collection_id) &&
      Boolean(itemAttributes.blockchain_item_id),
    urn: null,
    total_supply: itemFragment?.totalSupply
      ? Number(itemFragment?.totalSupply)
      : 0,
  }
  delete (resultItem as Omit<typeof resultItem, 'urn_suffix'> & {
    urn_suffix: unknown
  }).urn_suffix

  return resultItem
}

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
jest.mock('./Item.model')
jest.mock('../ethereum/api/collection')
jest.mock('../ethereum/api/peer')
jest.mock('../Collection/Collection.model')
jest.mock('../Committee')
jest.mock('./access')

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
    dbItem = {
      id: uuidv4(),
      urn_suffix: null,
      name: 'Test',
      description: '',
      thumbnail: '',
      eth_address: '',
      collection_id: collectionAttributesMock.id,
      blockchain_item_id: '0',
      price: '',
      beneficiary: '',
      rarity: ItemRarity.COMMON,
      type: ItemType.WEARABLE,
      data: {
        representations: [],
        replaces: [],
        hides: [],
        tags: [],
      },
      metrics: {
        meshes: 1,
        bodies: 2,
        materials: 3,
        textures: 4,
        triangles: 5,
        entities: 6,
      },
      contents: {},
      created_at: new Date(),
      updated_at: new Date(),
    }
    urn = `urn:decentraland:ropsten:collections-v2:${collectionAttributesMock.contract_address}:${dbItem.blockchain_item_id}`
    itemFragment = {
      id:
        collectionAttributesMock.contract_address +
        '-' +
        dbItem.blockchain_item_id,
      blockchainId: '0',
      urn,
      totalSupply: '1',
      price: dbItem.price!.toString(),
      beneficiary: 'aBeneficiary',
      minters: [],
      managers: [],
      collection: {
        id: collectionAttributesMock.id,
        creator: 'aCreator',
        owner: 'anOwner',
        name: collectionAttributesMock.name,
        isApproved: collectionAttributesMock.is_approved,
        minters: [],
        managers: [],
        reviewedAt: collectionAttributesMock.reviewed_at.toISOString(),
        updatedAt: collectionAttributesMock.updated_at.toISOString(),
        createdAt: collectionAttributesMock.created_at.toISOString(),
      },
      metadata: {},
    }
    wearable = {
      id: urn,
      name: dbItem.name,
      description: dbItem.description,
      collectionAddress: collectionAttributesMock.contract_address,
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
