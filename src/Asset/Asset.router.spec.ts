import { ExpressApp } from '../common/ExpressApp'
import { AssetRouter } from './Asset.router'
import { Asset } from './Asset.model'
import { getDefaultEthAddress } from '../AssetPack/utils'

jest.mock('./Asset.model')
jest.mock('../AssetPack/utils')

const anOwnerAddress = 'anOwnerAddress'

const anAsset = {
  id: 'anAssetId',
  asset_pack_id: 'anAssetPackId',
  name: 'anAsset',
  model: 'model.glb',
  category: 'decorations',
  contents: {},
  tags: [],
  metrics: {
    triangles: 0,
    materials: 0,
    textures: 0,
    meshes: 0,
    bodies: 0,
    entities: 0,
  },
}

const anotherAsset = {
  id: 'anotherAssetId',
  asset_pack_id: 'anotherAssetPackId',
  name: 'anotherAsset',
  model: 'another.glb',
  category: 'decorations',
  contents: {},
  tags: [],
  metrics: {
    triangles: 0,
    materials: 0,
    textures: 0,
    meshes: 0,
    bodies: 0,
    entities: 0,
  },
}

describe('Asset router', () => {
  let router: AssetRouter
  let req: {
    params: Record<string, string>
    query: Record<string, unknown>
    auth: { ethAddress: string }
  }

  beforeEach(() => {
    router = new AssetRouter(new ExpressApp())
    req = { params: {}, query: {}, auth: { ethAddress: anOwnerAddress } }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when getting a single asset', () => {
    beforeEach(() => {
      req.params = { id: anAsset.id }
    })

    describe('when the asset belongs to the caller', () => {
      beforeEach(() => {
        ;(Asset.findByIds as jest.Mock).mockResolvedValueOnce([anAsset])
      })

      it('should call findByIds with the caller and default addresses', async () => {
        await (router as any).getAsset(req)
        expect(Asset.findByIds).toHaveBeenCalledWith(
          [anAsset.id],
          [anOwnerAddress, getDefaultEthAddress()]
        )
      })

      it('should return the asset', async () => {
        const result = await (router as any).getAsset(req)
        expect(result).toEqual(anAsset)
      })
    })

    describe('when the asset does not belong to the caller or the default address', () => {
      beforeEach(() => {
        ;(Asset.findByIds as jest.Mock).mockResolvedValueOnce([])
      })

      it('should return null', async () => {
        const result = await (router as any).getAsset(req)
        expect(result).toBeNull()
      })
    })
  })

  describe('when getting multiple assets', () => {
    beforeEach(() => {
      req.query = { id: [anAsset.id, anotherAsset.id] }
    })

    describe('when all assets belong to the caller or the default address', () => {
      beforeEach(() => {
        ;(Asset.findByIds as jest.Mock).mockResolvedValueOnce([
          anAsset,
          anotherAsset,
        ])
      })

      it('should call findByIds with the caller and default addresses', async () => {
        await (router as any).getAssets(req)
        expect(Asset.findByIds).toHaveBeenCalledWith(
          [anAsset.id, anotherAsset.id],
          [anOwnerAddress, getDefaultEthAddress()]
        )
      })

      it('should return all visible assets', async () => {
        const result = await (router as any).getAssets(req)
        expect(result).toEqual([anAsset, anotherAsset])
      })
    })

    describe('when some assets belong to another user', () => {
      beforeEach(() => {
        ;(Asset.findByIds as jest.Mock).mockResolvedValueOnce([anAsset])
      })

      it('should return only the visible assets', async () => {
        const result = await (router as any).getAssets(req)
        expect(result).toEqual([anAsset])
      })
    })

    describe('when all assets belong to another user', () => {
      beforeEach(() => {
        ;(Asset.findByIds as jest.Mock).mockResolvedValueOnce([])
      })

      it('should return an empty array', async () => {
        const result = await (router as any).getAssets(req)
        expect(result).toEqual([])
      })
    })
  })
})
