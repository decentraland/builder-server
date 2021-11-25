import { server } from 'decentraland-server'
import { env, utils } from 'decentraland-commons'
import { v4 as uuidv4 } from 'uuid'
import express from 'express'
import { ILoggerComponent } from '@well-known-components/interfaces'

import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { getValidator } from '../utils/validator'
import { logExecutionTime } from '../utils/logging'
import {
  withModelExists,
  withModelAuthorization,
  withLowercaseQueryParams,
} from '../middleware'
import {
  withPermissiveAuthentication,
  withAuthentication,
  AuthRequest,
} from '../middleware/authentication'
import { S3AssetPack, getFileUploader, ACL } from '../S3'
import { ExpressApp } from '../common/ExpressApp'
import { asyncHandler } from '../common/asyncHandler'
import { Ownable } from '../Ownable'
import { Asset } from '../Asset'
import { AssetPack } from './AssetPack.model'
import {
  AssetPackAttributes,
  FullAssetPackAttributes,
  assetPackSchema,
} from './AssetPack.types'
import { getDefaultEthAddress } from './utils'

const BLACKLISTED_PROPERTIES = ['is_deleted']
const THUMBNAIL_FILE_NAME = 'thumbnail'
const THUMBNAIL_MIME_TYPES = ['image/png', 'image/jpeg']
const DEFAULT_ETH_ADDRESS = getDefaultEthAddress()
const DEFAULT_ASSET_PACK_CACHE = env.get('DEFAULT_ASSET_PACK_CACHE', 86400000)

const validator = getValidator()

export class AssetPackRouter extends Router {
  private defaultAssetPacks: FullAssetPackAttributes[] = []
  private defaultAssetPacksCachedResponse: string | null = null
  private lastDefaultAssetPacksFetch: number = 0
  private logger: ILoggerComponent.ILogger
  private isUpdatingDefaultAssetPacksCache: boolean = false
  private defaultAssetPacksCachePromise:
    | Promise<FullAssetPackAttributes[]>
    | undefined

  constructor(router: ExpressApp | express.Router, logger: ILoggerComponent) {
    super(router)
    this.logger = logger.getLogger('AssetPackRouter')
  }

  mount() {
    const withAssetPackExists = withModelExists(AssetPack)
    const withAssetPackAuthorization = withModelAuthorization(AssetPack)

    /**
     * Get all asset packs
     */
    this.router.get(
      '/assetPacks',
      withPermissiveAuthentication,
      withLowercaseQueryParams(['owner']),
      asyncHandler(this.getAssetPacks)
    )

    /**
     * Get asset pack
     */
    this.router.get(
      '/assetPacks/:id',
      withPermissiveAuthentication,
      server.handleRequest(this.getAssetPack)
    )

    /**
     * Upsert an asset pack and its assets
     */
    this.router.put(
      '/assetPacks/:id',
      withAuthentication,
      server.handleRequest(this.upsertAssetPack)
    )

    /**
     * Delete asset pack
     */
    this.router.delete(
      '/assetPacks/:id',
      withAuthentication,
      withAssetPackExists,
      withAssetPackAuthorization,
      server.handleRequest(this.deleteAssetPack)
    )

    /**
     * Upload asset pack thumbnail
     */
    this.router.post(
      '/assetPacks/:id/thumbnail',
      withAuthentication,
      withAssetPackExists,
      withAssetPackAuthorization,
      this.getFileUploaderMiddleware(),
      server.handleRequest(this.uploadThumbnail)
    )
  }

  getAssetPacks = async (
    req: express.Request,
    res: express.Response
  ): Promise<unknown> => {
    const ethAddress = (req as AuthRequest).auth?.ethAddress ?? ''
    const owner = req.query.owner
    const tracer = uuidv4()
    this.logger.info(
      `Starting request to get the assets packs with tracer ${tracer} and the address "${ethAddress}"`
    )

    // Process the owner query parameter first
    if (owner === 'default') {
      return this.sendDefaultAssetPacksRaw(res, tracer)
    } else if (ethAddress && owner === ethAddress) {
      const usersAssetPacks = await logExecutionTime(
        () => AssetPack.findByEthAddressWithAssets(ethAddress),
        this.logger,
        `Get the user\'s (${ethAddress}) asset packs`,
        tracer
      )
      return res.json(server.sendOk(usersAssetPacks))
    } else if (owner) {
      throw new HTTPError(
        'Unauthorized access to asset packs',
        { ethAddress },
        STATUS_CODES.unauthorized
      )
    }

    let assetPacks: FullAssetPackAttributes[] = []

    // Get user asset packs
    if (ethAddress) {
      assetPacks = await logExecutionTime(
        () => AssetPack.findByEthAddressWithAssets(ethAddress),
        this.logger,
        `Get the user\'s (${ethAddress}) asset packs`,
        tracer
      )
    }

    if (assetPacks.length === 0) {
      return this.sendDefaultAssetPacksRaw(res, tracer)
    }

    // Get default asset packs
    if (ethAddress !== DEFAULT_ETH_ADDRESS) {
      const [defaultAssetPacks] = await logExecutionTime(
        this.getDefaultAssetPacks,
        this.logger,
        'Get the default asset packs',
        tracer
      )
      assetPacks = [...assetPacks, ...defaultAssetPacks]
      this.logger.info(
        `[${tracer}] Assets pack length after adding the default asset packs: ${assetPacks.length}`
      )
    }

    this.logger.info(
      `[${tracer}] Final assets pack length: ${assetPacks.length}`
    )

    return res.json(server.sendOk(assetPacks))
  }

  getAssetPack = async (req: AuthRequest) => {
    const id = server.extractFromReq(req, 'id')
    const eth_address = req.auth ? req.auth.ethAddress : ''
    const tracer = uuidv4()
    this.logger.info(
      `Starting request to get the asset pack with id ${id} and the address ${eth_address} with tracer ${tracer}`
    )

    const isVisible = await logExecutionTime(
      () => AssetPack.isVisible(id, [eth_address, DEFAULT_ETH_ADDRESS]),
      this.logger,
      'Get if asset pack is visible',
      tracer
    )

    if (!isVisible) {
      throw new HTTPError(
        'Unauthorized user',
        { eth_address },
        STATUS_CODES.unauthorized
      )
    }

    this.logger.info(
      `[${tracer}] Assets pack with id ${id} is visible to ${eth_address}`
    )

    const assetPack = await logExecutionTime(
      () => AssetPack.findOneWithAssets(id),
      this.logger,
      'Find one with assets',
      tracer
    )

    if (!assetPack) {
      throw new HTTPError(
        'Asset pack not found',
        { id, eth_address },
        STATUS_CODES.notFound
      )
    }

    return this.sanitize([assetPack])[0]
  }

  async upsertAssetPack(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const assetPackJSON: any = server.extractFromReq(req, 'assetPack')
    const eth_address = req.auth.ethAddress

    const validate = validator.compile(assetPackSchema)
    validate(assetPackJSON)

    if (validate.errors) {
      throw new HTTPError('Invalid schema', validate.errors)
    }

    const canUpsert = await new Ownable(AssetPack).canUpsert(id, eth_address)
    if (!canUpsert) {
      throw new HTTPError('Unauthorized user', { id, eth_address })
    }

    const { assets } = utils.pick<Pick<FullAssetPackAttributes, 'assets'>>(
      assetPackJSON,
      ['assets']
    )
    const attributes = {
      ...utils.omit(assetPackJSON, ['assets']),
      eth_address,
    } as AssetPackAttributes

    if (id !== attributes.id) {
      throw new HTTPError('The body and URL assetPack ids do not match', {
        urlId: id,
        bodyId: attributes.id,
      })
    }

    const currentAssetPack = await AssetPack.findOneWithAssets(id)
    if (currentAssetPack) {
      // Only delete assets that no longer exist
      const assetIdsToDelete: string[] = []
      for (const currentAsset of currentAssetPack.assets) {
        if (!assets.find((asset) => asset.id === currentAsset.id)) {
          assetIdsToDelete.push(currentAsset.id)
        }
      }
      await Asset.deleteForAssetPackByIds(id, assetIdsToDelete)
    }

    const assetIds = assets.map((asset) => asset.id)
    if (await Asset.existsAnyWithADifferentEthAddress(assetIds, eth_address)) {
      throw new HTTPError(
        "One of the assets you're trying to upload belongs to a different address. Check the ids",
        { eth_address, assetIds }
      )
    }

    const upsertResult = await new AssetPack(attributes).upsert()
    await Promise.all(assets.map((asset) => new Asset(asset).upsert()))

    return upsertResult
  }

  async deleteAssetPack(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const eth_address = req.auth.ethAddress
    await AssetPack.delete({ id, eth_address })
    return true
  }

  async uploadThumbnail(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')

    const thumbnail = req.file as Express.MulterS3.File // using `single` on getFileUploaderMiddleware
    if (thumbnail) {
      const filename = new S3AssetPack(id).getThumbnailFilename()
      await AssetPack.update({ thumbnail: filename }, { id })
    }

    return true
  }

  private getFileUploaderMiddleware() {
    const uploader = getFileUploader(
      { acl: ACL.publicRead, mimeTypes: THUMBNAIL_MIME_TYPES },
      (req) => {
        const id = server.extractFromReq(req, 'id')
        const s3AssetPack = new S3AssetPack(id)
        const filename = s3AssetPack.getThumbnailFilename()
        return s3AssetPack.getFileKey(filename)
      }
    )

    return uploader.single(THUMBNAIL_FILE_NAME)
  }

  private sendDefaultAssetPacksRaw = async (
    res: express.Response,
    tracer: string
  ) => {
    const [, defaultAssetPacksRaw] = await logExecutionTime(
      this.getDefaultAssetPacks,
      this.logger,
      'Get default asset packs for default owner',
      tracer
    )
    res.setHeader('Content-Type', 'application/json')
    res.send(defaultAssetPacksRaw)
  }

  private getDefaultAssetPacks = async (): Promise<
    [FullAssetPackAttributes[], string]
  > => {
    const currentTimestamp = Date.now()
    const cacheHasExpired =
      currentTimestamp - this.lastDefaultAssetPacksFetch >
      Number(DEFAULT_ASSET_PACK_CACHE)

    const defaultAssetPacksIsNotCached =
      !this.defaultAssetPacksCachedResponse ||
      this.defaultAssetPacks.length === 0

    // This is to wait for the cache to be completed if there's no cache ready.
    // It will execute only the first time the server is up, and after the first fetch
    // the default asset packs will be cached.
    if (this.isUpdatingDefaultAssetPacksCache && defaultAssetPacksIsNotCached) {
      await this.defaultAssetPacksCachePromise
    }

    if (
      (defaultAssetPacksIsNotCached || cacheHasExpired) &&
      !this.isUpdatingDefaultAssetPacksCache
    ) {
      this.isUpdatingDefaultAssetPacksCache = true
      this.defaultAssetPacksCachePromise = AssetPack.findByEthAddressWithAssets(
        DEFAULT_ETH_ADDRESS
      )
      const defaultAssetPacks = await this.defaultAssetPacksCachePromise
      this.defaultAssetPacks = this.sanitize(defaultAssetPacks)
      this.defaultAssetPacksCachedResponse = JSON.stringify({
        ok: true,
        data: this.defaultAssetPacks,
      })
      this.lastDefaultAssetPacksFetch = currentTimestamp
      this.isUpdatingDefaultAssetPacksCache = false
    }

    return [this.defaultAssetPacks, this.defaultAssetPacksCachedResponse!]
  }

  private sanitize(assetPacks: FullAssetPackAttributes[]) {
    return utils.mapOmit<FullAssetPackAttributes>(
      assetPacks,
      BLACKLISTED_PROPERTIES
    )
  }
}
