import { Request, Response } from 'express'
import { server } from 'decentraland-server'
import { utils } from 'decentraland-commons'

import { Router } from '../common/Router'
import { HTTPError } from '../common/HTTPError'
import {
  withModelExists,
  asMiddleware,
  withModelAuthorization,
} from '../middleware'
import { S3AssetPack, S3Content, getFileUploader, ACL } from '../S3'
import { AssetPack } from '../AssetPack'
import { Asset } from './Asset.model'
import { withAuthentication } from '../middleware/authentication'

export class AssetRouter extends Router {
  assetFilesRequestHandler:
    | ((req: Request, res: Response) => Promise<boolean>) // Promisified RequestHandler
    | undefined

  mount() {
    const withAssetExists = withModelExists(Asset)
    const withAssetPackExists = withModelExists(AssetPack, 'assetPackId')
    const withAssetPackAuthorization = withModelAuthorization(
      AssetPack,
      'assetPackId'
    )

    this.assetFilesRequestHandler = this.getAssetFilesRequestHandler()

    /**
     * Upload the files for each asset in an asset pack
     */
    this.router.post(
      '/assetPacks/:assetPackId/assets/:id/files',
      withAuthentication,
      withAssetPackExists,
      withAssetPackAuthorization,
      asMiddleware(this.assetBelongsToPackMiddleware),
      server.handleRequest(this.uploadAssetFiles)
    )

    /**
     * Get a single asset
     */
    this.router.get(
      '/assets/:id',
      withAssetExists,
      server.handleRequest(this.getAsset)
    )

    /**
     * Get a multiple assets
     */
    this.router.get('/assets', server.handleRequest(this.getAssets))
  }

  async assetBelongsToPackMiddleware(req: Request) {
    const assetPackId = server.extractFromReq(req, 'assetPackId')
    const id = server.extractFromReq(req, 'id')

    const belongsToPack =
      (await Asset.count({ id, asset_pack_id: assetPackId })) === 1

    if (!belongsToPack) {
      throw new Error('Asset does not belong to asset pack')
    }
  }

  uploadAssetFiles = async (req: Request, res: Response) => {
    try {
      await this.assetFilesRequestHandler!(req, res)
    } catch (error) {
      const assetPackId = server.extractFromReq(req, 'assetPackId')
      const s3AssetPack = new S3AssetPack(assetPackId)

      try {
        await Promise.all([
          AssetPack.hardDelete({ id: assetPackId }),
          s3AssetPack.deleteFile(s3AssetPack.getThumbnailFilename()),
        ])
      } catch (error) {
        // Skip
      }

      throw new HTTPError('An error occurred trying to upload asset files', {
        message: error.message,
      })
    }
  }

  private getAssetFilesRequestHandler() {
    const uploader = getFileUploader({ acl: ACL.publicRead }, (_, file) =>
      new S3Content().getFileKey(file.fieldname)
    )
    return utils.promisify<boolean>(uploader.any())
  }

  private getAsset(req: Request) {
    const id = server.extractFromReq(req, 'id')
    return Asset.findOne(id)
  }

  private getAssets(req: Request) {
    const reqIds = server.extractFromReq<string | string[]>(req, 'id')
    const ids: string[] = Array.isArray(reqIds) ? reqIds : [reqIds]
    return Asset.findByIds(ids)
  }
}
