import { server } from 'decentraland-server'
import { env, utils } from 'decentraland-commons'
import Ajv from 'ajv'

import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import {
  withAuthentication,
  withPermissiveAuthentication,
  withModelExists,
  AuthRequest
} from '../middleware'
import { withModelAuthorization } from '../middleware/authorization'
import { S3AssetPack, getFileUploader, ACL } from '../S3'
import { Ownable } from '../Ownable'
import { Asset } from '../Asset'
import { AssetPack } from './AssetPack.model'
import { AssetPackAttributes, assetPackSchema } from './AssetPack.types'

const BLACKLISTED_PROPERTIES = ['is_deleted']
const THUMBNAIL_FILE_NAME = 'thumbnail'
const THUMBNAIL_MIME_TYPES = ['image/png', 'image/jpeg']
const DEFAULT_USER_ID = env.get('DEFAULT_USER_ID', '')

const ajv = new Ajv()

export class AssetPackRouter extends Router {
  defaultAssetPacks: AssetPackAttributes[] = []
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
    const user_id = req.auth ? req.auth.sub : ''

    const defaultAssetPacks = await this.getDefaultAssetPacks()
    const userAssetPacks =
      user_id && user_id !== DEFAULT_USER_ID
        ? await AssetPack.findByUserId(user_id)
        : []

    return defaultAssetPacks.concat(userAssetPacks)
  }

  getAssetPack = async (req: AuthRequest) => {
    const id = server.extractFromReq(req, 'id')
    const user_id = req.auth ? req.auth.sub : ''

    const isVisible = await AssetPack.isVisible(id, [user_id, DEFAULT_USER_ID])

    if (!isVisible) {
      throw new HTTPError(
        'Unauthorized user',
        { user_id },
        STATUS_CODES.unauthorized
      )
    }

    const assetPack = await AssetPack.findOneWithAssets(id)

    if (!assetPack) {
      throw new HTTPError(
        'Asset pack not found',
        { id, user_id },
        STATUS_CODES.notFound
      )
    }

    return this.sanitize([assetPack])[0]
  }

  async upsertAssetPack(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const assetPackJSON: any = server.extractFromReq(req, 'assetPack')
    const user_id = req.auth.sub

    const validator = ajv.compile(assetPackSchema)
    validator(assetPackJSON)

    if (validator.errors) {
      throw new HTTPError('Invalid schema', validator.errors)
    }

    const canUpsert = await new Ownable(AssetPack).canUpsert(id, user_id)
    if (!canUpsert) {
      throw new HTTPError('Unauthorized user', { id, user_id })
    }

    const { assets } = utils.pick<Pick<AssetPackAttributes, 'assets'>>(
      assetPackJSON,
      ['assets']
    )
    const attributes = {
      ...utils.omit(assetPackJSON, ['assets']),
      user_id
    } as AssetPackAttributes

    if (id !== attributes.id) {
      throw new HTTPError('The body and URL assetPack ids do not match', {
        urlId: id,
        bodyId: attributes.id
      })
    }

    const currentAssetPack = await AssetPack.findOneWithAssets(id)
    if (currentAssetPack) {
      // Only delete assets that no longer exist
      const assetIdsToDelete: string[] = []
      for (const currentAsset of currentAssetPack.assets) {
        if (!assets.find(asset => asset.id === currentAsset.id)) {
          assetIdsToDelete.push(currentAsset.id)
        }
      }
      await Asset.deleteByIds(assetIdsToDelete)
    }

    const upsertResult = await new AssetPack(attributes).upsert()
    await Promise.all(assets.map(asset => new Asset(asset).upsert()))

    return upsertResult
  }

  async deleteAssetPack(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const user_id = req.auth.sub
    await AssetPack.delete({ id, user_id })
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
      req => {
        const id = server.extractFromReq(req, 'id')
        const s3AssetPack = new S3AssetPack(id)
        const filename = s3AssetPack.getThumbnailFilename()
        return s3AssetPack.getFileKey(filename)
      }
    )

    return uploader.single(THUMBNAIL_FILE_NAME)
  }

  private async getDefaultAssetPacks() {
    const aDayPassed = Date.now() - this.lastDefaultAssetPacksFetch > 1440000 // 24 * 60 * 1000

    if (this.defaultAssetPacks.length === 0 || aDayPassed) {
      const defaultAssetPacks = await AssetPack.findByUserId(DEFAULT_USER_ID)
      this.defaultAssetPacks = this.sanitize(defaultAssetPacks)
      this.lastDefaultAssetPacksFetch = Date.now()
    }

    return this.defaultAssetPacks
  }

  private sanitize(assetPacks: AssetPackAttributes[]) {
    return utils.mapOmit<AssetPackAttributes>(
      assetPacks,
      BLACKLISTED_PROPERTIES
    )
  }
}
