import { server } from 'decentraland-server'
import { env, utils } from 'decentraland-commons'

import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { getValidator } from '../utils/validator'
import { withModelExists, withModelAuthorization } from '../middleware'
import {
  withPermissiveAuthentication,
  withAuthentication,
  AuthRequest,
} from '../middleware/authentication'
import { S3AssetPack, getFileUploader, ACL } from '../S3'
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
const DEFAULT_ASSET_PACK_CACHE = env.get('DEFAULT_ASSET_PACK_CACHE', 1440000)

const validator = getValidator()

export class AssetPackRouter extends Router {
  defaultAssetPacks: FullAssetPackAttributes[] = []
  lastDefaultAssetPacksFetch = Date.now()

  mount() {
    const withAssetPackExists = withModelExists(AssetPack)
    const withAssetPackAuthorization = withModelAuthorization(AssetPack)

    /**
     * Get all asset packs
     */
    this.router.get(
      '/assetPacks',
      withPermissiveAuthentication,
      server.handleRequest(this.getAssetPacks)
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
     * Uplaod asset pack thumbnail
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

  getAssetPacks = async (req: AuthRequest) => {
    const ethAddress = req.auth ? req.auth.ethAddress : ''
    let assetPacks: FullAssetPackAttributes[] = []

    // Get default asset packs
    if (!ethAddress || ethAddress !== DEFAULT_ETH_ADDRESS) {
      const defaultAssetPacks = await this.getDefaultAssetPacks()
      assetPacks = [...assetPacks, ...defaultAssetPacks]
    }

    // Get user asset packs
    if (ethAddress) {
      const userAssetPacks = await AssetPack.findByEthAddressWithAssets(
        ethAddress
      )
      assetPacks = [...assetPacks, ...userAssetPacks]
    }

    return assetPacks
  }

  getAssetPack = async (req: AuthRequest) => {
    const id = server.extractFromReq(req, 'id')
    const eth_address = req.auth ? req.auth.ethAddress : ''

    const isVisible = await AssetPack.isVisible(id, [
      eth_address,
      DEFAULT_ETH_ADDRESS,
    ])

    if (!isVisible) {
      throw new HTTPError(
        'Unauthorized user',
        { eth_address },
        STATUS_CODES.unauthorized
      )
    }

    const assetPack = await AssetPack.findOneWithAssets(id)

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

    const upsertResult = await new AssetPack(attributes).upsert()
    await Promise.all(
      assets.map((asset) =>
        new Asset(asset).upsert({ target: ['id', 'asset_pack_id'] })
      )
    )

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

  private async getDefaultAssetPacks() {
    const aDayPassed =
      Date.now() - this.lastDefaultAssetPacksFetch >
      Number(DEFAULT_ASSET_PACK_CACHE) // 24 * 60 * 1000

    if (this.defaultAssetPacks.length === 0 || aDayPassed) {
      const defaultAssetPacks = await AssetPack.findByEthAddressWithAssets(
        DEFAULT_ETH_ADDRESS
      )
      this.defaultAssetPacks = this.sanitize(defaultAssetPacks)
      this.lastDefaultAssetPacksFetch = Date.now()
    }

    return this.defaultAssetPacks
  }

  private sanitize(assetPacks: FullAssetPackAttributes[]) {
    return utils.mapOmit<FullAssetPackAttributes>(
      assetPacks,
      BLACKLISTED_PROPERTIES
    )
  }
}
