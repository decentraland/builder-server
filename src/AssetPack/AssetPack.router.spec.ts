import { ILoggerComponent } from '@well-known-components/interfaces'
import { ExpressApp } from '../common/ExpressApp'
import { AssetPackRouter } from './AssetPack.router'
import { AssetPack } from './AssetPack.model'
import { Asset } from '../Asset'
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

    beforeEach(() => {
      upsertedAssetAttrs = []
      const mockUpsert = jest.fn().mockResolvedValue({})
      ;((Asset as unknown) as jest.Mock).mockImplementation((attrs: any) => {
        upsertedAssetAttrs.push(attrs)
        return { upsert: mockUpsert, attributes: attrs }
      })
      assetUpsertSpy = mockUpsert
      ;(AssetPack.count as jest.Mock).mockResolvedValue(0)
      ;(Asset.existsAnyWithADifferentEthAddress as jest.Mock).mockResolvedValue(
        false
      )
      ;(AssetPack.findOneWithAssets as jest.Mock).mockResolvedValue(null)
      ;((AssetPack as unknown) as jest.Mock).mockImplementation(
        (attrs: any) => ({
          upsert: jest.fn().mockResolvedValue(attrs),
          attributes: attrs,
        })
      )
    })

    describe('when an asset has a different asset_pack_id than the request id', () => {
      beforeEach(() => {
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

      it('should use the asset_pack_id with the request id, not the body value', async () => {
        await router.upsertAssetPack(upsertReq)

        expect(assetUpsertSpy).toHaveBeenCalled()
        expect(upsertedAssetAttrs).toHaveLength(1)
        expect(upsertedAssetAttrs[0].asset_pack_id).toBe(anAssetPackId)
      })

      it('should never persist the body-supplied asset_pack_id', async () => {
        await router.upsertAssetPack(upsertReq)

        expect(upsertedAssetAttrs[0].asset_pack_id).not.toBe(anotherAssetPackId)
      })
    })
  })
})
