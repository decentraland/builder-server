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
import { ItemAttributes, ItemType } from './Item.types'
import { peerAPI, Wearable } from '../ethereum/api/peer'
import { ItemFragment } from '../ethereum/api/fragments'
import { ItemRarity } from '.'

function toResultItem(
  itemAttributes: ItemAttributes
): Omit<ItemAttributes, 'created_at' | 'updated_at'> & {
  created_at: string
  updated_at: string
} {
  return {
    ...itemAttributes,
    created_at: itemAttributes.created_at.toISOString(),
    updated_at: itemAttributes.updated_at.toISOString(),
  }
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
  let itemAttributes: ItemAttributes
  let itemAttributesOfNonPublishedItem: ItemAttributes
  let resultingItemAttributesOfNonPublishedItem: Omit<
    ItemAttributes,
    'created_at' | 'updated_at'
  > & {
    created_at: string
    updated_at: string
  }
  let wearable: Wearable
  let itemFragment: ItemFragment
  let urn: string
  let resultingItemAttributes: Omit<
    ItemAttributes,
    'created_at' | 'updated_at'
  > & { created_at: string; updated_at: string }
  let url: string

  beforeEach(() => {
    itemAttributes = {
      id: uuidv4(),
      urn: null,
      name: 'Test',
      description: '',
      thumbnail: '',
      eth_address: '',
      collection_id: collectionAttributesMock.id,
      blockchain_item_id: '0',
      price: '',
      beneficiary: '',
      rarity: ItemRarity.COMMON,
      total_supply: 1,
      is_published: true,
      is_approved: collectionAttributesMock.is_approved,
      in_catalyst: true,
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
    urn = `urn:decentraland:ropsten:collections-v2:${collectionAttributesMock.contract_address}:${itemAttributes.blockchain_item_id}`
    itemFragment = {
      id:
        collectionAttributesMock.contract_address +
        '-' +
        itemAttributes.blockchain_item_id,
      blockchainId: '0',
      urn,
      totalSupply: itemAttributes.total_supply.toString(),
      price: itemAttributes.price!.toString(),
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
      name: itemAttributes.name,
      description: itemAttributes.description,
      collectionAddress: collectionAttributesMock.contract_address,
      rarity: ItemRarity.COMMON,
      image: '',
      thumbnail: '',
      metrics: itemAttributes.metrics,
      contents: {},
      data: {
        representations: [],
        replaces: [],
        hides: [],
        tags: [],
      },
      createdAt: itemAttributes.created_at.getTime(),
      updatedAt: itemAttributes.updated_at.getTime(),
    }
    resultingItemAttributes = toResultItem(itemAttributes)
    itemAttributes.collection_id = collectionAttributesMock.id
    itemAttributes.blockchain_item_id = '0'
    itemAttributesOfNonPublishedItem = {
      ...itemAttributes,
      id: uuidv4(),
      collection_id: 'aCollectionId',
      blockchain_item_id: null,
    }
    resultingItemAttributesOfNonPublishedItem = toResultItem(
      itemAttributesOfNonPublishedItem
    )
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when getting an item', () => {
    beforeEach(() => {
      mockExistsMiddleware(Item, itemAttributes.id)
      mockAuthorizationMiddleware(Item, itemAttributes.id, wallet.address)
      ;(hasAccess as jest.Mock).mockResolvedValueOnce(true)
      ;(Item.findOne as jest.Mock).mockResolvedValueOnce(itemAttributes)
      url = `/items/${itemAttributes.id}`
    })

    describe('when the item belongs to a published collection', () => {
      beforeEach(() => {
        itemAttributes.collection_id = collectionAttributesMock.id
        itemAttributes.blockchain_item_id = '0'
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
      })

      it('should return the requested item with its URN', () => {
        return server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(200)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: {
                ...resultingItemAttributes,
                beneficiary: itemFragment.beneficiary,
                collection_id: itemAttributes.collection_id,
                blockchain_item_id: itemAttributes.blockchain_item_id,
                urn,
              },
              ok: true,
            })
            expect(Item.findOne).toHaveBeenCalledWith(itemAttributes.id)
          })
      })
    })

    describe("when the item doesn't belong to a collection", () => {
      beforeEach(() => {
        itemAttributes.collection_id = null
      })

      it('should return the requested item with a nulled URN', () => {
        return server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(200)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: { ...resultingItemAttributes, collection_id: null },
              ok: true,
            })
            expect(Item.findOne).toHaveBeenCalledWith(itemAttributes.id)
          })
      })
    })

    describe("when the item doesn't belong to a published collection", () => {
      beforeEach(() => {
        itemAttributes.collection_id = 'aCollectionId'
        itemAttributes.blockchain_item_id = null
      })

      it('should return the requested item with a nulled URN', () => {
        return server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(200)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: {
                ...resultingItemAttributes,
                collection_id: itemAttributes.collection_id,
                blockchain_item_id: null,
              },
              ok: true,
            })
            expect(Item.findOne).toHaveBeenCalledWith(itemAttributes.id)
          })
      })
    })
  })

  describe('when getting all the items', () => {
    beforeEach(() => {
      ;(isCommitteeMember as jest.Mock).mockResolvedValueOnce(true)
      ;(Item.find as jest.Mock).mockResolvedValueOnce([
        itemAttributes,
        itemAttributesOfNonPublishedItem,
      ])
      ;(collectionAPI.fetchItems as jest.Mock).mockResolvedValueOnce([
        itemFragment,
      ])
      mockItemConsolidation([itemAttributes], [wearable])
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
                ...resultingItemAttributes,
                beneficiary: itemFragment.beneficiary,
                collection_id: itemAttributes.collection_id,
                blockchain_item_id: itemAttributes.blockchain_item_id,
                urn,
              },
              resultingItemAttributesOfNonPublishedItem,
            ],
            ok: true,
          })
        })
    })
  })

  describe('when getting all the items of an address', () => {
    beforeEach(() => {
      ;(Item.find as jest.Mock).mockResolvedValueOnce([
        itemAttributes,
        itemAttributesOfNonPublishedItem,
      ])
      ;(collectionAPI.fetchItemsByAuthorizedUser as jest.Mock).mockResolvedValueOnce(
        [itemFragment]
      )
      mockItemConsolidation([itemAttributes], [wearable])
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
                ...resultingItemAttributes,
                beneficiary: itemFragment.beneficiary,
                collection_id: itemAttributes.collection_id,
                blockchain_item_id: itemAttributes.blockchain_item_id,
                urn,
              },
              resultingItemAttributesOfNonPublishedItem,
            ],
            ok: true,
          })
        })
    })
  })

  describe('when getting all the items of a collection', () => {
    beforeEach(() => {
      ;(Item.find as jest.Mock).mockResolvedValueOnce([
        itemAttributes,
        itemAttributesOfNonPublishedItem,
      ])
      ;(hasAccess as jest.Mock).mockResolvedValueOnce(true)
      ;(collectionAPI.fetchCollectionWithItemsByContractAddress as jest.Mock).mockResolvedValueOnce(
        { collection: itemFragment.collection, items: [itemFragment] }
      )
      ;(Collection.findOne as jest.Mock).mockResolvedValueOnce([
        collectionAttributesMock,
      ])
      mockItemConsolidation([itemAttributes], [wearable])
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
                ...resultingItemAttributes,
                beneficiary: itemFragment.beneficiary,
                collection_id: itemAttributes.collection_id,
                blockchain_item_id: itemAttributes.blockchain_item_id,
                urn,
              },
              resultingItemAttributesOfNonPublishedItem,
            ],
            ok: true,
          })
        })
    })
  })
})