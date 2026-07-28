import { ILoggerComponent } from '@well-known-components/interfaces'
import { ExpressApp } from '../common/ExpressApp'
import { AssetPackRouter } from './AssetPack.router'
import { AssetPack } from './AssetPack.model'
import { Asset, MAX_ASSETS_COUNT } from '../Asset'
import { getDefaultEthAddress } from './utils'

jest.mock('./AssetPack.model')
jest.mock('../Asset/Asset.model')

const anAssetPack = {
  id: 'anId',
  title: 'aTitle',
  thumbnail: 'aThumbnail',
  eth_address: 'anAddress',
  is_deleted: false,
  assets: [],
  created_at: new Date(),
  updated_at: new Date(),
}

const anotherAssetPack = {
  id: 'anotherId',
  title: 'anotherTitle',
  thumbnail: 'anotherThumbnail',
  eth_address: 'anotherAddress',
  is_deleted: false,
  assets: [],
  created_at: new Date(),
  updated_at: new Date(),
}

const aSanitizedAssetPack = {
  ...anAssetPack,
} as any

delete aSanitizedAssetPack.is_deleted

const anotherSanitizedAssetPack = {
  ...anotherAssetPack,
} as any

delete anotherSanitizedAssetPack.is_deleted

type MockedRes = {
  send: jest.Mock
  json: jest.Mock
  setHeader: jest.Mock
  status: jest.Mock
}

function buildMockedRes(): MockedRes {
  const anotherRes = {
    send: jest.fn(),
    json: jest.fn(),
    setHeader: jest.fn(),
    status: jest.fn(),
  }
  anotherRes.status.mockReturnValue(anotherRes)
  return anotherRes
}

describe('AssetPack router', () => {
  const logger = {
    getLogger: () => ({
      info: jest.fn(),
      log: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    }),
  } as ILoggerComponent
  let req: {
    query: Record<string, string>
    auth: { ethAddress?: string }
  }
  let res: MockedRes
  let router: AssetPackRouter

  beforeEach(() => {
    router = new AssetPackRouter(new ExpressApp(), logger)
    req = { query: {}, auth: { ethAddress: undefined } }
    res = buildMockedRes()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when getting the asset packs', () => {
    describe('when the owner query parameter is defined', () => {
      describe("when the owner query parameter is 'default'", () => {
        beforeEach(async () => {
          req.query = { owner: 'default' }
          ;(AssetPack.findByEthAddressWithAssets as jest.Mock).mockResolvedValueOnce(
            [anAssetPack]
          )
          await router.getAssetPacks(req as any, res as any)
        })

        it('should send the default raw assets packs', () => {
          expect(res.send).toHaveBeenCalledWith(
            `{"ok":true,"data":[${JSON.stringify(aSanitizedAssetPack)}]}`
          )
        })

        it('should have set the response headers to application/json', () => {
          expect(res.setHeader).toHaveBeenCalledWith(
            'Content-Type',
            'application/json'
          )
        })
      })

      describe('when the owner query parameter is an address equal to the one in the authorization', () => {
        beforeEach(() => {
          req.query = { owner: 'anOwner' }
          req.auth.ethAddress = 'anOwner'
          ;(AssetPack.findByEthAddressWithAssets as jest.Mock).mockResolvedValueOnce(
            [anAssetPack]
          )
        })

        it('should send the assets of the user', async () => {
          await router.getAssetPacks(req as any, res as any)
          expect(res.json).toHaveBeenCalledWith({
            ok: true,
            data: [anAssetPack],
          })
        })
      })

      describe('when the owner query parameter is different from the one authorized', () => {
        beforeEach(() => {
          req.query = { owner: 'anOwner' }
          req.auth.ethAddress = 'anotherOwner'
        })

        it('should throw an unauthorized error', () => {
          return expect(
            router.getAssetPacks(req as any, res as any)
          ).rejects.toThrowError('Unauthorized access to asset packs')
        })
      })
    })

    describe('when the owner query parameter is not defined', () => {
      beforeEach(() => {
        req.query = {}
      })

      describe("when the authentication module has the user's address", () => {
        beforeEach(() => {
          req.auth.ethAddress = 'anAddress'
        })

        describe("when the user doesn't have any asset packs", () => {
          beforeEach(async () => {
            // First mock to get the user's asset packs
            ;(AssetPack.findByEthAddressWithAssets as jest.Mock).mockResolvedValueOnce(
              []
            )
            // Second mock to get the default asset packs
            ;(AssetPack.findByEthAddressWithAssets as jest.Mock).mockResolvedValueOnce(
              [aSanitizedAssetPack]
            )
            await router.getAssetPacks(req as any, res as any)
          })

          it('should send the default raw assets packs', () => {
            expect(res.send).toHaveBeenCalledWith(
              `{"ok":true,"data":[${JSON.stringify(aSanitizedAssetPack)}]}`
            )
          })

          it('should have set the response headers to application/json', () => {
            expect(res.setHeader).toHaveBeenCalledWith(
              'Content-Type',
              'application/json'
            )
          })
        })

        describe('when the user has asset packs', () => {
          beforeEach(async () => {
            // The first mock gets the user's asset packs and the second one the default ones
            ;(AssetPack.findByEthAddressWithAssets as jest.Mock)
              .mockResolvedValueOnce([aSanitizedAssetPack])
              .mockResolvedValueOnce([anotherSanitizedAssetPack])
          })

          describe("when the user's address is not the default address", () => {
            it("should send the user's assets alongside with the default assets", async () => {
              await router.getAssetPacks(req as any, res as any)
              expect(res.json).toHaveBeenCalledWith({
                data: [aSanitizedAssetPack, anotherSanitizedAssetPack],
                ok: true,
              })
            })
          })

          describe("when the user's address is the default address", () => {
            beforeEach(() => {
              req.auth.ethAddress = getDefaultEthAddress()
            })

            it("should send the user's assets", async () => {
              await router.getAssetPacks(req as any, res as any)
              expect(res.json).toHaveBeenCalledWith({
                data: [aSanitizedAssetPack],
                ok: true,
              })
            })
          })
        })
      })

      describe("when the authentication module doesn't have the user's address", () => {
        beforeEach(async () => {
          req.auth.ethAddress = undefined
          ;(AssetPack.findByEthAddressWithAssets as jest.Mock).mockResolvedValueOnce(
            [aSanitizedAssetPack]
          )

          await router.getAssetPacks(req as any, res as any)
        })

        it('should send the default raw assets packs', () => {
          expect(res.send).toHaveBeenCalledWith(
            `{"ok":true,"data":[${JSON.stringify(aSanitizedAssetPack)}]}`
          )
        })

        it('should have set the response headers to application/json', () => {
          expect(res.setHeader).toHaveBeenCalledWith(
            'Content-Type',
            'application/json'
          )
        })
      })
    })

    describe('when retrieving the users and the default assets in the same day', () => {
      beforeEach(async () => {
        req.query = {}
        req.auth.ethAddress = 'anAddress'
        ;(AssetPack.findByEthAddressWithAssets as jest.Mock)
          .mockResolvedValueOnce([aSanitizedAssetPack])
          .mockResolvedValueOnce([anotherSanitizedAssetPack])
        await router.getAssetPacks(req as any, res as any)
        ;(AssetPack.findByEthAddressWithAssets as jest.Mock)
          .mockReset()
          .mockResolvedValueOnce([aSanitizedAssetPack])
        await router.getAssetPacks(req as any, res as any)
      })

      it('should only call the method to retrieve the data from the DB once for the user assets', async () => {
        expect(
          AssetPack.findByEthAddressWithAssets as jest.Mock
        ).toHaveBeenCalledTimes(1)
      })

      it('should send the user assets with the default assets from the cache', () => {
        expect(res.json).toHaveBeenCalledWith({
          data: [aSanitizedAssetPack, anotherSanitizedAssetPack],
          ok: true,
        })
      })
    })

    describe('when retrieving the default asset pack at the same time', () => {
      let resolver: (value: unknown) => void
      let anotherRes: MockedRes

      beforeEach(async () => {
        anotherRes = buildMockedRes()
        req.query = { owner: 'default' }
        jest
          .spyOn(Date, 'now')
          .mockReturnValueOnce(172800000)
          .mockReturnValueOnce(432000000)
          .mockReturnValueOnce(432000000)
        ;(AssetPack.findByEthAddressWithAssets as jest.Mock)
          .mockReset()
          .mockResolvedValueOnce([aSanitizedAssetPack])
          .mockReturnValueOnce(new Promise((resolve) => (resolver = resolve)))
        await router.getAssetPacks(req as any, res as any)
        res.send.mockReset()
      })

      describe('and the cache is expired', () => {
        it('should start updating the cache and return the old cache for the other concurrent requests', async () => {
          const firstRequest = router.getAssetPacks(req as any, res as any)
          const secondRequest = router.getAssetPacks(
            req as any,
            anotherRes as any
          )
          resolver([aSanitizedAssetPack, anotherSanitizedAssetPack])
          await firstRequest
          await secondRequest

          expect(res.send).toHaveBeenCalledWith(
            `{"ok":true,"data":${JSON.stringify([
              aSanitizedAssetPack,
              anotherSanitizedAssetPack,
            ])}}`
          )
          expect(anotherRes.send).toHaveBeenCalledWith(
            `{"ok":true,"data":[${JSON.stringify(aSanitizedAssetPack)}]}`
          )
        })
      })

      describe("and there's no cache", () => {
        beforeEach(() => {
          anotherRes = buildMockedRes()
          req.query = { owner: 'default' }
          jest
            .spyOn(Date, 'now')
            .mockReturnValueOnce(172800000)
            .mockReturnValueOnce(172800000)
          ;(AssetPack.findByEthAddressWithAssets as jest.Mock)
            .mockReset()
            .mockReturnValueOnce(new Promise((resolve) => (resolver = resolve)))
        })

        it('should start updating the cache and all concurrent requests should wait for the first one to finish', async () => {
          const firstRequest = router.getAssetPacks(req as any, res as any)
          const secondRequest = router.getAssetPacks(
            req as any,
            anotherRes as any
          )
          resolver([aSanitizedAssetPack])
          await firstRequest
          await secondRequest

          expect(res.send).toHaveBeenCalledWith(
            `{"ok":true,"data":[${JSON.stringify(aSanitizedAssetPack)}]}`
          )
          expect(anotherRes.send).toHaveBeenCalledWith(
            `{"ok":true,"data":[${JSON.stringify(aSanitizedAssetPack)}]}`
          )
        })
      })
    })

    describe('when retrieving the users and the default assets when a day has passed', () => {
      beforeEach(async () => {
        req.query = {}
        req.auth.ethAddress = 'anAddress'
        // Get the assets from the DB and cache them
        jest.spyOn(Date, 'now').mockReturnValueOnce(172800000)
        ;(AssetPack.findByEthAddressWithAssets as jest.Mock)
          .mockResolvedValueOnce([aSanitizedAssetPack])
          .mockResolvedValueOnce([anotherSanitizedAssetPack])
        await router.getAssetPacks(req as any, res as any)
        // Get the assets from the DB again, after more than one day passed and cache them
        jest.spyOn(Date, 'now').mockReturnValueOnce(432000000)
        ;(AssetPack.findByEthAddressWithAssets as jest.Mock)
          .mockReset()
          .mockResolvedValueOnce([aSanitizedAssetPack])
          .mockResolvedValueOnce([anotherSanitizedAssetPack])
        await router.getAssetPacks(req as any, res as any)
      })

      it('should call the method to retrieve the assets from the DB twice, once for the users assets and another one for the default assets', async () => {
        expect(
          AssetPack.findByEthAddressWithAssets as jest.Mock
        ).toHaveBeenCalledTimes(2)
      })

      it('should send the user assets with the default assets from the cache', () => {
        expect(res.json).toHaveBeenCalledWith({
          data: [aSanitizedAssetPack, anotherSanitizedAssetPack],
          ok: true,
        })
      })
    })
  })

  describe('when upserting an asset pack', () => {
    const anAssetPackId = '8c251928-fb34-40e9-86d2-868a60d2fa78'
    const anotherAssetPackId = '49c9ae13-6779-4ced-b208-dd352c9b7541'
    const anOwnerAddress = 'anOwnerAddress'
    let upsertReq: any
    let assetUpsertSpy: jest.SpyInstance
    let upsertedAssetAttrs: any[]
    let upsertedPackAttrs: any[]

    const buildAsset = (id: string, assetPackId: string) => ({
      id,
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
      Array.from({ length: count }, (_, index) =>
        buildAsset(
          `1e27cbda-5582-4219-8f83-${(index + 1)
            .toString(16)
            .padStart(12, '0')}`,
          anAssetPackId
        )
      )

    const buildUpsertReq = (
      assets: unknown[],
      extraPackAttributes: Record<string, unknown> = {},
      ethAddress: string = anOwnerAddress
    ) => ({
      params: { id: anAssetPackId },
      body: {
        assetPack: {
          id: anAssetPackId,
          title: 'an-asset-pack',
          assets,
          ...extraPackAttributes,
        },
      },
      auth: { ethAddress },
    })

    const mockStoredAssetPack = (
      createdAt: Date,
      ethAddress: string = anOwnerAddress
    ) => {
      const storedAssetPack = {
        id: anAssetPackId,
        eth_address: ethAddress,
        created_at: createdAt,
      }
      ;(AssetPack.findOne as jest.Mock).mockResolvedValue(storedAssetPack)
      ;(AssetPack.findOneWithAssets as jest.Mock).mockResolvedValue({
        ...storedAssetPack,
        assets: [],
      })
    }

    beforeEach(() => {
      upsertedAssetAttrs = []
      upsertedPackAttrs = []
      const mockUpsert = jest.fn().mockResolvedValue({})
      ;((Asset as unknown) as jest.Mock).mockImplementation((attrs: any) => {
        upsertedAssetAttrs.push(attrs)
        return { upsert: mockUpsert, attributes: attrs }
      })
      assetUpsertSpy = mockUpsert
      ;(AssetPack.findOne as jest.Mock).mockResolvedValue(undefined)
      ;(Asset.existsAnyWithADifferentEthAddress as jest.Mock).mockResolvedValue(
        false
      )
      ;(Asset.existsAnyWithADifferentAssetPackId as jest.Mock).mockResolvedValue(
        false
      )
      ;(AssetPack.findOneWithAssets as jest.Mock).mockResolvedValue(null)
      ;((AssetPack as unknown) as jest.Mock).mockImplementation(
        (attrs: any) => {
          upsertedPackAttrs.push(attrs)
          return {
            upsert: jest.fn().mockResolvedValue(attrs),
            attributes: attrs,
          }
        }
      )
    })

    describe('when an asset already belongs to a different asset pack', () => {
      beforeEach(() => {
        ;(Asset.existsAnyWithADifferentAssetPackId as jest.Mock).mockResolvedValue(
          true
        )
        upsertReq = {
          params: { id: anAssetPackId },
          body: {
            assetPack: {
              id: anAssetPackId,
              title: 'an-asset-pack',
              assets: [
                {
                  id: '1e27cbda-5582-4219-8f83-2db817344cc1',
                  asset_pack_id: anotherAssetPackId,
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
                },
              ],
            },
          },
          auth: { ethAddress: anOwnerAddress },
        }
      })

      it('should throw an error', async () => {
        await expect(router.upsertAssetPack(upsertReq)).rejects.toThrow(
          "One of the assets you're trying to upload is invalid"
        )
      })

      it('should not upsert any assets', async () => {
        await expect(router.upsertAssetPack(upsertReq)).rejects.toThrow()
        expect(assetUpsertSpy).not.toHaveBeenCalled()
      })
    })

    describe('when a new asset names an asset pack other than the one in the URL', () => {
      const aNewAssetId = '1e27cbda-5582-4219-8f83-2db817344cc1'

      beforeEach(() => {
        upsertReq = buildUpsertReq([
          buildAsset(aNewAssetId, anotherAssetPackId),
        ])
      })

      it('should store the asset under the asset pack from the URL', async () => {
        await router.upsertAssetPack(upsertReq)

        expect(upsertedAssetAttrs).toHaveLength(1)
        expect(upsertedAssetAttrs[0].asset_pack_id).toBe(anAssetPackId)
      })

      it('should not store the asset under the asset pack named in the body', async () => {
        await router.upsertAssetPack(upsertReq)

        expect(upsertedAssetAttrs[0].asset_pack_id).not.toBe(anotherAssetPackId)
      })
    })

    describe('when only some of the assets name the asset pack from the URL', () => {
      beforeEach(() => {
        upsertReq = buildUpsertReq([
          buildAsset('1e27cbda-5582-4219-8f83-2db817344cc1', anAssetPackId),
          buildAsset(
            '2f38dceb-6693-4320-9094-3ec928455dd2',
            anotherAssetPackId
          ),
        ])
      })

      it('should store every asset under the asset pack from the URL', async () => {
        await router.upsertAssetPack(upsertReq)

        expect(upsertedAssetAttrs).toHaveLength(2)
        expect(upsertedAssetAttrs.map((asset) => asset.asset_pack_id)).toEqual([
          anAssetPackId,
          anAssetPackId,
        ])
      })
    })

    describe('when the body supplies created_at and updated_at', () => {
      const aPastDate = '2020-01-01T00:00:00.000Z'

      beforeEach(() => {
        upsertReq = buildUpsertReq([], {
          created_at: aPastDate,
          updated_at: aPastDate,
        })
      })

      describe('and the asset pack does not exist yet', () => {
        it('should store server generated dates instead of the supplied ones', async () => {
          await router.upsertAssetPack(upsertReq)

          expect(upsertedPackAttrs).toHaveLength(1)
          expect(upsertedPackAttrs[0].created_at).not.toEqual(aPastDate)
          expect(upsertedPackAttrs[0].created_at).toBeInstanceOf(Date)
          expect(upsertedPackAttrs[0].updated_at).toBeInstanceOf(Date)
        })
      })

      describe('and the asset pack already exists', () => {
        const anExistingCreationDate = new Date('2023-06-15T10:00:00.000Z')

        beforeEach(() => {
          const storedAssetPack = {
            id: anAssetPackId,
            eth_address: anOwnerAddress,
            created_at: anExistingCreationDate,
          }
          ;(AssetPack.findOne as jest.Mock).mockResolvedValue(storedAssetPack)
          ;(AssetPack.findOneWithAssets as jest.Mock).mockResolvedValue({
            ...storedAssetPack,
            assets: [],
          })
        })

        it('should keep the stored creation date and refresh the update date', async () => {
          await router.upsertAssetPack(upsertReq)

          expect(upsertedPackAttrs[0].created_at).toEqual(
            anExistingCreationDate
          )
          expect(upsertedPackAttrs[0].updated_at).not.toEqual(
            anExistingCreationDate
          )
        })
      })
    })

    describe('when the asset pack belongs to a different address', () => {
      const anotherOwnerAddress = 'anotherOwnerAddress'
      const aStoredAssetPack = {
        id: anAssetPackId,
        eth_address: anotherOwnerAddress,
        created_at: new Date('2023-06-15T10:00:00.000Z'),
      }

      beforeEach(() => {
        upsertReq = buildUpsertReq([
          buildAsset('1e27cbda-5582-4219-8f83-2db817344cc1', anAssetPackId),
        ])
      })

      describe('and the asset pack is not deleted', () => {
        beforeEach(() => {
          ;(AssetPack.findOne as jest.Mock).mockResolvedValue({
            ...aStoredAssetPack,
            is_deleted: false,
          })
        })

        it('should be rejected without upserting the pack or any asset', async () => {
          await expect(router.upsertAssetPack(upsertReq)).rejects.toThrow(
            'Unauthorized user'
          )
          expect(upsertedPackAttrs).toHaveLength(0)
          expect(assetUpsertSpy).not.toHaveBeenCalled()
        })
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

        it('should be rejected without upserting the pack or any asset', async () => {
          await expect(router.upsertAssetPack(upsertReq)).rejects.toThrow(
            'Unauthorized user'
          )
          expect(upsertedPackAttrs).toHaveLength(0)
          expect(assetUpsertSpy).not.toHaveBeenCalled()
        })
      })
    })

    // The limit is what the client-supplied `created_at` was able to switch off:
    // `isAfterLimitSplitDate` reads the stored date, so it must never come from the body.
    describe('when the assets exceed the limit', () => {
      const anAfterSplitDate = new Date('2023-06-15T10:00:00.000Z')
      const aBeforeSplitDate = new Date('2021-01-01T00:00:00.000Z')

      describe('and the asset pack does not exist yet', () => {
        beforeEach(() => {
          upsertReq = buildUpsertReq(buildAssets(MAX_ASSETS_COUNT + 1))
        })

        it('should be rejected without upserting the pack or any asset', async () => {
          await expect(router.upsertAssetPack(upsertReq)).rejects.toThrow(
            'Too many assets'
          )
          expect(upsertedPackAttrs).toHaveLength(0)
          expect(assetUpsertSpy).not.toHaveBeenCalled()
        })
      })

      describe('and the asset pack was created after the limit split date', () => {
        beforeEach(() => {
          mockStoredAssetPack(anAfterSplitDate)
          upsertReq = buildUpsertReq(buildAssets(MAX_ASSETS_COUNT + 1))
        })

        it('should be rejected without upserting the pack or any asset', async () => {
          await expect(router.upsertAssetPack(upsertReq)).rejects.toThrow(
            'Too many assets'
          )
          expect(upsertedPackAttrs).toHaveLength(0)
          expect(assetUpsertSpy).not.toHaveBeenCalled()
        })
      })

      describe('and the body claims a date before the limit split date', () => {
        beforeEach(() => {
          mockStoredAssetPack(anAfterSplitDate)
          upsertReq = buildUpsertReq(buildAssets(MAX_ASSETS_COUNT + 1), {
            created_at: '2021-01-01T00:00:00.000Z',
          })
        })

        it('should still be rejected, ignoring the date from the body', async () => {
          await expect(router.upsertAssetPack(upsertReq)).rejects.toThrow(
            'Too many assets'
          )
          expect(assetUpsertSpy).not.toHaveBeenCalled()
        })
      })

      describe('and the stored asset pack predates the limit split date', () => {
        beforeEach(() => {
          mockStoredAssetPack(aBeforeSplitDate)
          upsertReq = buildUpsertReq(buildAssets(MAX_ASSETS_COUNT + 1))
        })

        it('should be exempt from the limit', async () => {
          await router.upsertAssetPack(upsertReq)

          expect(upsertedAssetAttrs).toHaveLength(MAX_ASSETS_COUNT + 1)
        })
      })

      describe('and the caller is the default address', () => {
        beforeEach(() => {
          mockStoredAssetPack(anAfterSplitDate, getDefaultEthAddress())
          upsertReq = buildUpsertReq(
            buildAssets(MAX_ASSETS_COUNT + 1),
            {},
            getDefaultEthAddress()
          )
        })

        it('should be exempt from the limit', async () => {
          await router.upsertAssetPack(upsertReq)

          expect(upsertedAssetAttrs).toHaveLength(MAX_ASSETS_COUNT + 1)
        })
      })
    })

    describe('when the asset pack does not exist', () => {
      beforeEach(() => {
        ;(AssetPack.findOne as jest.Mock).mockResolvedValue(undefined)
        upsertReq = buildUpsertReq([
          buildAsset('1e27cbda-5582-4219-8f83-2db817344cc1', anAssetPackId),
        ])
      })

      it('should create it for the caller', async () => {
        await router.upsertAssetPack(upsertReq)

        expect(upsertedPackAttrs).toHaveLength(1)
        expect(upsertedPackAttrs[0].eth_address).toBe(anOwnerAddress)
        expect(assetUpsertSpy).toHaveBeenCalled()
      })
    })
  })
})
