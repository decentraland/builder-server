import { ILoggerComponent } from '@well-known-components/interfaces'
import { AssetPackRouter } from './AssetPack.router'
import { ExpressApp } from '../common/ExpressApp'
import { AssetPack } from './AssetPack.model'

jest.mock('./AssetPack.model')

describe('something', () => {
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
  let res: {
    send: jest.Mock
    json: jest.Mock
    setHeader: jest.Mock
    status: jest.Mock
  }
  let router: AssetPackRouter
  beforeEach(() => {
    router = new AssetPackRouter(new ExpressApp(), logger)
    req = { query: {}, auth: { ethAddress: undefined } }
    res = {
      send: jest.fn(),
      json: jest.fn(),
      setHeader: jest.fn(),
      status: jest.fn(),
    }
    res.status.mockReturnValue(res)
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('when getting the asset packs', () => {
    describe('when the owner query parameter is defined', () => {
      describe("when the owner query parameter is 'default'", () => {
        beforeEach(async () => {
          req.query = { owner: 'default' }
          ;(AssetPack.findByEthAddressWithAssets as jest.Mock).mockResolvedValueOnce(
            []
          )
          await router.getAssetPacks(req as any, res as any)
        })

        it('should send the default raw assets packs', async () => {
          expect(res.send).toHaveBeenLastCalledWith('{"ok":true,"data":[]}')
        })

        it('should have set the response headers to application/json', async () => {
          expect(res.setHeader).toHaveBeenLastCalledWith(
            'Content-Type',
            'application/json'
          )
        })

        it('should have set the response status to 200', () => {
          expect(res.status).toHaveBeenLastCalledWith(200)
        })
      })

      describe('when the owner query parameter is an address equal to the one in the authorization', () => {
        beforeEach(() => {
          req.query = { owner: 'anOwner' }
          req.auth.ethAddress = 'anOwner'
          ;(AssetPack.findByEthAddressWithAssets as jest.Mock).mockResolvedValueOnce(
            []
          )
        })

        it('should send the assets of the user', async () => {
          await router.getAssetPacks(req as any, res as any)
          expect(res.json).toHaveBeenCalledWith({ ok: true, data: [] })
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
            ;(AssetPack.findByEthAddressWithAssets as jest.Mock).mockResolvedValue(
              []
            )
            await router.getAssetPacks(req as any, res as any)
          })

          it('should send the default raw assets packs', async () => {
            expect(res.send).toHaveBeenLastCalledWith('{"ok":true,"data":[]}')
          })

          it('should have set the response headers to application/json', async () => {
            expect(res.setHeader).toHaveBeenLastCalledWith(
              'Content-Type',
              'application/json'
            )
          })

          it('should have set the response status to 200', () => {
            expect(res.status).toHaveBeenLastCalledWith(200)
          })
        })
      })
    })
  })
})
