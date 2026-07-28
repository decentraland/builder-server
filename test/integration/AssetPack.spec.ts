import supertest from 'supertest'
import { ethers } from 'ethers'
import { AuthIdentity } from '@dcl/crypto'
import { buildURL, createAuthHeaders } from '../../spec/utils'
import { wallet, createIdentity, fakePrivateKey } from '../../spec/mocks/wallet'
import { app } from '../../src/server'
import { AssetPack } from '../../src/AssetPack/AssetPack.model'
import { Asset } from '../../src/Asset/Asset.model'
import { MAX_ASSETS_COUNT } from '../../src/Asset'

jest.mock('../../src/AssetPack/AssetPack.model')
jest.mock('../../src/Asset/Asset.model')

const server = supertest(app.getApp())

/**
 * Models are mocked to capture the attributes each row would be written with; the
 * request itself goes over HTTP so the authentication middleware and the request
 * schema take part in the assertions.
 */
describe('when upserting an asset pack over HTTP', () => {
  const anAssetPackId = '8c251928-fb34-40e9-86d2-868a60d2fa78'
  const anotherAssetPackId = '49c9ae13-6779-4ced-b208-dd352c9b7541'
  const anAssetId = '1e27cbda-5582-4219-8f83-2db817344cc1'

  let url: string
  let upsertedAssetAttrs: any[]
  let upsertedPackAttrs: any[]
  let assetUpsertSpy: jest.Mock

  const buildAsset = (assetPackId: string) => ({
    id: anAssetId,
    asset_pack_id: assetPackId,
    name: 'an-asset',
    model: 'model.glb',
    category: 'decorations',
    contents: {},
    tags: ['test'],
    metrics: {
      triangles: 0,
      materials: 0,
      textures: 0,
      meshes: 0,
      bodies: 0,
      entities: 0,
    },
  })

  const buildAssets = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      ...buildAsset(anAssetPackId),
      id: `1e27cbda-5582-4219-8f83-${(index + 1)
        .toString(16)
        .padStart(12, '0')}`,
    }))

  const buildBody = (
    assets: unknown[],
    extraPackAttributes: Record<string, unknown> = {}
  ) => ({
    assetPack: {
      id: anAssetPackId,
      title: 'an-asset-pack',
      assets,
      ...extraPackAttributes,
    },
  })

  beforeEach(() => {
    url = `/assetPacks/${anAssetPackId}`
    upsertedAssetAttrs = []
    upsertedPackAttrs = []
    assetUpsertSpy = jest.fn().mockResolvedValue({})
    ;((Asset as unknown) as jest.Mock).mockImplementation((attrs: any) => {
      upsertedAssetAttrs.push(attrs)
      return { upsert: assetUpsertSpy, attributes: attrs }
    })
    ;((AssetPack as unknown) as jest.Mock).mockImplementation((attrs: any) => {
      upsertedPackAttrs.push(attrs)
      return { upsert: jest.fn().mockResolvedValue(attrs), attributes: attrs }
    })
    ;(Asset.existsAnyWithADifferentEthAddress as jest.Mock).mockResolvedValue(
      false
    )
    ;(Asset.existsAnyWithADifferentAssetPackId as jest.Mock).mockResolvedValue(
      false
    )
    ;(AssetPack.findOneWithAssets as jest.Mock).mockResolvedValue(null)
    ;(AssetPack.findOne as jest.Mock).mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and one of the assets names a different asset pack', () => {
    it('should store the asset under the asset pack from the URL', () => {
      return server
        .put(buildURL(url))
        .set(createAuthHeaders('put', url))
        .send(buildBody([buildAsset(anotherAssetPackId)]))
        .expect(200)
        .then(() => {
          expect(upsertedAssetAttrs).toHaveLength(1)
          expect(upsertedAssetAttrs[0].asset_pack_id).toBe(anAssetPackId)
          expect(assetUpsertSpy).toHaveBeenCalled()
        })
    })
  })

  describe('and one of the assets already belongs to a different address', () => {
    beforeEach(() => {
      ;(Asset.existsAnyWithADifferentEthAddress as jest.Mock).mockResolvedValue(
        true
      )
    })

    it('should be rejected without upserting any asset', () => {
      return server
        .put(buildURL(url))
        .set(createAuthHeaders('put', url))
        .send(buildBody([buildAsset(anAssetPackId)]))
        .expect(400)
        .then(() => {
          expect(assetUpsertSpy).not.toHaveBeenCalled()
        })
    })
  })

  describe('and the body supplies a creation date', () => {
    const aPastDate = '2020-01-01T00:00:00.000Z'

    it('should store a server generated creation date instead', () => {
      return server
        .put(buildURL(url))
        .set(createAuthHeaders('put', url))
        .send(buildBody([], { created_at: aPastDate, updated_at: aPastDate }))
        .expect(200)
        .then(() => {
          expect(upsertedPackAttrs).toHaveLength(1)
          expect(upsertedPackAttrs[0].created_at).not.toEqual(aPastDate)
          expect(upsertedPackAttrs[0].created_at).toBeInstanceOf(Date)
        })
    })
  })

  describe('and the caller does not own the asset pack', () => {
    const aStoredAssetPack = {
      id: anAssetPackId,
      eth_address: wallet.address,
      created_at: new Date('2023-06-15T10:00:00.000Z'),
    }
    let nonOwnerIdentity: AuthIdentity

    beforeAll(async () => {
      const nonOwnerWallet = new ethers.Wallet(fakePrivateKey)
      nonOwnerIdentity = await createIdentity(nonOwnerWallet, nonOwnerWallet, 1)
    })

    // The error is asserted before the status so a failure reports why the request
    // was refused rather than only which code came back.
    const expectRejection = () =>
      server
        .put(buildURL(url))
        .set(createAuthHeaders('put', url, nonOwnerIdentity))
        .send(buildBody([buildAsset(anAssetPackId)]))
        .then((response) => {
          expect(response.body.error).toContain('Unauthorized user')
          expect(response.status).toBe(401)
          expect(upsertedPackAttrs).toHaveLength(0)
          expect(assetUpsertSpy).not.toHaveBeenCalled()
        })

    describe('and the asset pack is not deleted', () => {
      beforeEach(() => {
        ;(AssetPack.findOne as jest.Mock).mockResolvedValue({
          ...aStoredAssetPack,
          is_deleted: false,
        })
      })

      it(
        'should be rejected without upserting the pack or any asset',
        expectRejection
      )
    })

    // A soft-deleted pack is invisible to `AssetPack.count`, so ownership has to
    // be read off the row itself.
    describe('and the asset pack is soft deleted', () => {
      beforeEach(() => {
        ;(AssetPack.findOne as jest.Mock).mockResolvedValue({
          ...aStoredAssetPack,
          is_deleted: true,
        })
      })

      it(
        'should be rejected without upserting the pack or any asset',
        expectRejection
      )
    })
  })

  describe('and the assets are not sent as an array', () => {
    it('should be rejected by the schema without upserting anything', () => {
      return server
        .put(buildURL(url))
        .set(createAuthHeaders('put', url))
        .send({
          assetPack: {
            id: anAssetPackId,
            title: 'an-asset-pack',
            assets: 'not-an-array',
          },
        })
        .then((response) => {
          expect(response.body.ok).toBe(false)
          expect(response.body.error).toContain('Invalid schema')
          expect(response.body.error).not.toContain('is not a function')
          expect(response.status).toBe(400)
          expect(upsertedPackAttrs).toHaveLength(0)
          expect(assetUpsertSpy).not.toHaveBeenCalled()
        })
    })
  })

  // The limit is what a client-supplied `created_at` was able to switch off, so the
  // body must not be able to reinstate that bypass.
  describe('and the assets exceed the limit while the body claims an older date', () => {
    beforeEach(() => {
      const storedAssetPack = {
        id: anAssetPackId,
        eth_address: wallet.address,
        created_at: new Date('2023-06-15T10:00:00.000Z'),
      }
      ;(AssetPack.findOne as jest.Mock).mockResolvedValue(storedAssetPack)
      ;(AssetPack.findOneWithAssets as jest.Mock).mockResolvedValue({
        ...storedAssetPack,
        assets: [],
      })
    })

    it('should be rejected without upserting the pack or any asset', () => {
      return server
        .put(buildURL(url))
        .set(createAuthHeaders('put', url))
        .send(
          buildBody(buildAssets(MAX_ASSETS_COUNT + 1), {
            created_at: '2021-01-01T00:00:00.000Z',
          })
        )
        .then((response) => {
          expect(response.body.error).toContain('Too many assets')
          expect(response.status).toBe(400)
          expect(upsertedPackAttrs).toHaveLength(0)
          expect(assetUpsertSpy).not.toHaveBeenCalled()
        })
    })
  })

  describe('and the body names a different asset pack than the URL', () => {
    it('should be rejected without upserting the pack or any asset', () => {
      return server
        .put(buildURL(url))
        .set(createAuthHeaders('put', url))
        .send({
          assetPack: {
            id: anotherAssetPackId,
            title: 'an-asset-pack',
            assets: [],
          },
        })
        .then((response) => {
          expect(response.body.error).toContain('do not match')
          expect(response.status).toBe(400)
          expect(upsertedPackAttrs).toHaveLength(0)
          expect(assetUpsertSpy).not.toHaveBeenCalled()
        })
    })
  })
})
