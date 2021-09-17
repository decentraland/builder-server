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
// jest.mock('../Ownable')

// console.log(Item)

// const mockOwnable = Ownable as jest.Mock

const validItem = {
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

describe('when upsertItem is called', () => {
  let itemFindOneSpy = jest.spyOn(Item, 'findOne')
  let collectionFindOneSpy = jest.spyOn(Collection, 'findOne')
  let ownableCanUpsertSpy = jest.spyOn(Ownable.prototype, 'canUpsert')

  beforeEach(() => {
    // mockOwnable.mockImplementation(() => ({
    //   canUpsert: () => Promise.resolve(true),
    // }))
    ownableCanUpsertSpy.mockResolvedValue(true)
    itemFindOneSpy.mockResolvedValue(undefined)
    collectionFindOneSpy.mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when param id is different from payload id', () => {
    it('should fail with body and url ids do not match message', async () => {
      const app = new ExpressApp()
      const router = new ItemRouter(app)

      const req: any = {
        query: { id: 'id' },
        body: { item: { id: 'different id' } },
      }

      await expect(router.upsertItem(req)).rejects.toThrowError(
        'The body and URL item ids do not match'
      )
    })
  })

  describe('when payload schema is invalid', () => {
    it('should fail with invalid schema', async () => {
      const app = new ExpressApp()
      const router = new ItemRouter(app)

      const req: any = {
        query: { id: 'id' },
        body: { item: { id: 'id' } },
        auth: { ethAddress: 'ethAddress' },
      }

      await expect(router.upsertItem(req)).rejects.toThrowError(
        'Invalid schema'
      )
    })
  })

  describe('when is_approved is sent in the payload', () => {
    it('should fail with cant set is_approved message', async () => {
      const app = new ExpressApp()
      const router = new ItemRouter(app)

      const req: any = {
        query: { id: validItem.id },
        body: { item: { ...validItem, is_approved: true } },
        auth: { ethAddress: 'ethAddress' },
      }

      await expect(router.upsertItem(req)).rejects.toThrowError(
        'Can not change is_published or is_approved property'
      )
    })
  })

  describe('when is_published is sent in the payload', () => {
    it('should fail with cant set is_approved message', async () => {
      const app = new ExpressApp()
      const router = new ItemRouter(app)

      const req: any = {
        query: { id: validItem.id },
        body: { item: { ...validItem, is_published: true } },
        auth: { ethAddress: 'ethAddress' },
      }

      await expect(router.upsertItem(req)).rejects.toThrowError(
        'Can not change is_published or is_approved property'
      )
    })
  })

  describe('when the user is unauthorized to upsert the item', () => {
    it('should fail with unauthorized user message', async () => {
      ownableCanUpsertSpy.mockResolvedValueOnce(false)

      const app = new ExpressApp()
      const router = new ItemRouter(app)

      const req: any = {
        query: { id: validItem.id },
        body: { item: validItem },
        auth: { ethAddress: 'ethAddress' },
      }

      await expect(router.upsertItem(req)).rejects.toThrowError(
        'Unauthorized user'
      )
    })
  })

  describe('when the item collection is being changed', () => {
    it('should fail with cant change item collection message', async () => {
      itemFindOneSpy.mockImplementationOnce(() =>
        Promise.resolve({
          ...validItem,
          collection_id: 'ffb11be4-94f0-47a6-bf1c-6d77fbbea1d3',
        })
      )

      const app = new ExpressApp()
      const router = new ItemRouter(app)

      const req: any = {
        query: { id: validItem.id },
        body: {
          item: {
            ...validItem,
            collection_id: '6d3fd719-57c1-4436-bec3-7dd954c3fbfe',
          },
        },
        auth: { ethAddress: validItem.eth_address },
      }

      await expect(router.upsertItem(req)).rejects.toThrowError(
        "Item can't change between collections"
      )
    })
  })

  describe('when the collection is published', () => {
    describe('when the item is being upserted for the first time', () => {
      it('should fail with can not add item to published collection message', async () => {
        collectionFindOneSpy.mockResolvedValueOnce({
          collection_id: '6d3fd719-57c1-4436-bec3-7dd954c3fbfe',
          eth_address: validItem.eth_address,
        })

        jest
          .spyOn(collectionAPI, 'fetchCollectionWithItemsByContractAddress')
          .mockImplementation(() =>
            Promise.resolve({
              collection: {} as CollectionFragment,
              items: [{}] as ItemFragment[],
            })
          )

        jest
          .spyOn(peerAPI, 'fetchWearables')
          .mockImplementation(() => Promise.resolve([{}] as Wearable[]))

        const app = new ExpressApp()
        const router = new ItemRouter(app)

        const req: any = {
          query: { id: validItem.id },
          body: {
            item: {
              ...validItem,
              collection_id: '6d3fd719-57c1-4436-bec3-7dd954c3fbfe',
            },
          },
          auth: { ethAddress: validItem.eth_address },
        }

        await expect(router.upsertItem(req)).rejects.toThrowError(
          "Items can't be added to a published collection"
        )
      })
    })

    describe('when the item is being removed from the collection', () => {
      it('should fail with can not remove item from published collection message', async () => {
        itemFindOneSpy.mockImplementationOnce(() =>
          Promise.resolve({
            ...validItem,
            collection_id: '6d3fd719-57c1-4436-bec3-7dd954c3fbfe',
          })
        )

        collectionFindOneSpy.mockImplementationOnce(() =>
          Promise.resolve({
            collection_id: '6d3fd719-57c1-4436-bec3-7dd954c3fbfe',
            eth_address: validItem.eth_address,
          })
        )

        jest
          .spyOn(collectionAPI, 'fetchCollectionWithItemsByContractAddress')
          .mockImplementation(() =>
            Promise.resolve({
              collection: {} as CollectionFragment,
              items: [{}] as ItemFragment[],
            })
          )

        jest
          .spyOn(peerAPI, 'fetchWearables')
          .mockImplementation(() => Promise.resolve([{}] as Wearable[]))

        const app = new ExpressApp()
        const router = new ItemRouter(app)

        const req: any = {
          query: { id: validItem.id },
          body: {
            item: validItem,
          },
          auth: { ethAddress: validItem.eth_address },
        }

        await expect(router.upsertItem(req)).rejects.toThrowError(
          "Items can't be removed from a pubished collection"
        )
      })
    })

    describe("when the item's rarity is being changed", () => {
      it('should fail with can not update items rarity message', async () => {
        itemFindOneSpy.mockImplementationOnce(() =>
          Promise.resolve({
            ...validItem,
            rarity: 'mythic',
            collection_id: '6d3fd719-57c1-4436-bec3-7dd954c3fbfe',
          })
        )

        collectionFindOneSpy.mockImplementationOnce(() =>
          Promise.resolve({
            collection_id: '6d3fd719-57c1-4436-bec3-7dd954c3fbfe',
            eth_address: validItem.eth_address,
          })
        )

        jest
          .spyOn(collectionAPI, 'fetchCollectionWithItemsByContractAddress')
          .mockImplementation(() =>
            Promise.resolve({
              collection: {} as CollectionFragment,
              items: [{}] as ItemFragment[],
            })
          )

        jest
          .spyOn(peerAPI, 'fetchWearables')
          .mockImplementation(() => Promise.resolve([{}] as Wearable[]))

        const app = new ExpressApp()
        const router = new ItemRouter(app)

        const req: any = {
          query: { id: validItem.id },
          body: {
            item: {
              ...validItem,
              rarity: 'unique',
              collection_id: '6d3fd719-57c1-4436-bec3-7dd954c3fbfe',
            },
          },
          auth: { ethAddress: validItem.eth_address },
        }

        await expect(router.upsertItem(req)).rejects.toThrowError(
          "An item rarity from a published collection can't be changed"
        )
      })
    })
  })

  describe('when everything is correct', () => {
    it('should resolve correctly', async () => {
      itemFindOneSpy.mockImplementationOnce(() =>
        Promise.resolve({
          ...validItem,
          collection_id: '6d3fd719-57c1-4436-bec3-7dd954c3fbfe',
        })
      )

      collectionFindOneSpy.mockImplementationOnce(() =>
        Promise.resolve({
          collection_id: '6d3fd719-57c1-4436-bec3-7dd954c3fbfe',
          eth_address: validItem.eth_address,
        })
      )

      jest
        .spyOn(collectionAPI, 'fetchCollectionWithItemsByContractAddress')
        .mockImplementation(() =>
          Promise.resolve({
            collection: {} as CollectionFragment,
            items: [{}] as ItemFragment[],
          })
        )

      jest
        .spyOn(peerAPI, 'fetchWearables')
        .mockImplementation(() => Promise.resolve([{}] as Wearable[]))

      jest
        .spyOn(Item.prototype, 'upsert')
        .mockImplementation(() => Promise.resolve({} as ItemAttributes))

      const app = new ExpressApp()
      const router = new ItemRouter(app)

      const req: any = {
        query: { id: validItem.id },
        body: {
          item: {
            ...validItem,
            collection_id: '6d3fd719-57c1-4436-bec3-7dd954c3fbfe',
          },
        },
        auth: { ethAddress: validItem.eth_address },
      }

      await expect(router.upsertItem(req)).resolves.toStrictEqual({})
    })
  })
})
