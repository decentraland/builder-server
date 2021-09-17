import { Item } from './Item.model'
import { ExpressApp } from '../common/ExpressApp'
import { Ownable } from '../Ownable'
import { ItemRouter } from './Item.router'
import { Collection } from '../Collection'
import { collectionAPI } from '../ethereum/api/collection'
import { peerAPI, Wearable } from '../ethereum/api/peer'
import { CollectionFragment, ItemFragment } from '../ethereum/api/fragments'
import { ItemAttributes } from '.'

jest.mock('../common/Router')
jest.mock('../common/ExpressApp')

describe('when upsertItem is called', () => {
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

    return expect(router.upsertItem(req)).resolves.toStrictEqual({})
  }

  const mockIsCollectionPublished = () => {
    collectionFindOneSpy.mockResolvedValueOnce({
      collection_id: testCollectionId,
      eth_address: testItem.eth_address,
    })
    
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

  const mockItemFindOne = (merge: any = {}) => {
    itemFindOneSpy.mockResolvedValueOnce({
      ...testItem,
      collection_id: testCollectionId,
      ...merge,
    })
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

  describe('when payload schema is invalid', () => {
    it('should fail with invalid schema', async () => {
      await testError(
        {
          query: {
            id: 'id',
          },
          body: {
            item: {
              id: 'id',
            },
          },
          auth: {
            ethAddress: 'ethAddress',
          },
        },
        'Invalid schema'
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
            ethAddress: 'ethAddress',
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
            ethAddress: 'ethAddress',
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
            ethAddress: 'ethAddress',
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
