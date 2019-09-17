import { Request, Response } from 'express'
import { server } from 'decentraland-server'
import { utils } from 'decentraland-commons'

import { Router } from '../common/Router'
import { HTTPError } from '../common/HTTPError'
import {
  withAuthentication,
  withModelExists,
  asMiddleware
} from '../middleware'
import { withModelAuthorization } from '../middleware/authorization'
import { S3AssetPack, S3Asset, getFileUploader, ACL } from '../S3'
import { AssetPack } from '../AssetPack'
import { Asset } from './Asset.model'

export class AssetRouter extends Router {
  assetFilesRequestHandler:
    | ((req: Request, res: Response) => Promise<boolean>) // Promisified RequestHandler
    | undefined

  mount() {
    const withassetPackExists = withModelExists(AssetPack, 'assetPackId')
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
      withassetPackExists,
      withAssetPackAuthorization,
      asMiddleware(this.assetBelongsToPackMiddleware),
      server.handleRequest(this.uploadAssetFiles)
    )
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
          s3AssetPack.deleteFile(s3AssetPack.getThumbnailFilename())
        ])
      } catch (error) {
        // Skip
      }

      throw new HTTPError('An error occurred trying to upload asset files', {
        message: error.message
      })
    }
  }

  private getAssetFilesRequestHandler() {
    const uploader = getFileUploader({ acl: ACL.publicRead }, (_, file) =>
      new S3Asset().getFileKey(file.fieldname)
    )
    return utils.promisify<boolean>(uploader.any())
  }
}
