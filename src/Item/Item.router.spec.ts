import { ExpressApp } from '../common/ExpressApp'
import { Ownable } from '../Ownable'
import { ItemRouter } from './Item.router'

jest.mock('../common/Router')
jest.mock('../common/ExpressApp')
jest.mock('../Ownable')

const mockOwnable = Ownable as jest.Mock

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

  describe('when the user can not upsert the item', () => {
    it('should fail with unauthorized user message', async () => {
      mockOwnable.mockImplementationOnce(() => {
        return {
          canUpsert: jest.fn().mockResolvedValue(false),
        }
      })

      const app = new ExpressApp()
      const router = new ItemRouter(app)

      const req: any = {
        query: {
          id: 'a8aca0ee-b3f6-4a8e-a78c-d8efeb099cd9',
        },
        body: {
          item: validItem,
        },
        auth: { ethAddress: 'ethAddress' },
      }

      await expect(router.upsertItem(req)).rejects.toThrowError(
        'Unauthorized user'
      )
    })
  })
})
