import supertest from 'supertest'
import { v4 as uuidv4 } from 'uuid'
import {
  wallet,
  createAuthHeaders,
  buildURL,
  mockExistsMiddleware,
  mockAuthorizationMiddleware,
} from '../../spec/utils'
// import { collectionAPI } from '../ethereum/api/collection'
// import { isCommitteeMember } from '../Committee'
import { app } from '../server'
import { Item } from './Item.model'
import { hasAccess } from './access'
import { ItemAttributes, ItemType } from './Item.types'

const server = supertest(app.getApp())
// jest.mock('../ethereum/api/collection')
jest.mock('./Item.model')
jest.mock('../Committee')
jest.mock('./access')

describe('Item router', () => {
  let itemAttributes: ItemAttributes
  let resultingItemAttributes: Omit<
    ItemAttributes,
    'created_at' | 'updated_at'
  > & { created_at: string; updated_at: string }

  beforeEach(() => {
    itemAttributes = {
      id: uuidv4(),
      urn: null,
      name: 'Test',
      description: '',
      thumbnail: '',
      eth_address: '',
      collection_id: '',
      blockchain_item_id: '',
      price: '',
      beneficiary: '',
      rarity: null,
      total_supply: 1,
      is_published: true,
      is_approved: true,
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

    resultingItemAttributes = {
      ...itemAttributes,
      created_at: itemAttributes.created_at.toISOString(),
      updated_at: itemAttributes.updated_at.toISOString(),
    }
  })

  describe('when getting an item', () => {
    beforeEach(() => {
      mockExistsMiddleware(Item, itemAttributes.id)
      mockAuthorizationMiddleware(Item, itemAttributes.id, wallet.address)
      ;(hasAccess as jest.Mock).mockResolvedValueOnce(true)
      ;(Item.findOne as jest.Mock).mockResolvedValueOnce(itemAttributes)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe.skip('when the item belongs to a published collection', () => {
      beforeEach(() => {
        itemAttributes.collection_id = 'aCollectionId'
        itemAttributes.blockchain_item_id = '0'
      })

      it('should return the requested item with its URN', () => {
        const url = `/items/${itemAttributes.id}`

        return server
          .get(buildURL(url))
          .set(createAuthHeaders('get', url))
          .expect(200)
          .then((response: any) => {
            expect(response.body).toEqual({
              data: {
                ...resultingItemAttributes,
                collection_id: itemAttributes.collection_id,
                blockchain_item_id: itemAttributes.blockchain_item_id,
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
        const url = `/items/${itemAttributes.id}`

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
        const url = `/items/${itemAttributes.id}`

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
})
