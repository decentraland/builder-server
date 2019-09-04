import { Request, Response } from 'express'
import { server } from 'decentraland-server'
import { utils } from 'decentraland-commons'

import { Router } from '../common/Router'
import { HTTPError } from '../common/HTTPError'
import {
  authentication,
  AuthRequest,
  modelExists,
  asMiddleware
} from '../middleware'
import { modelAuthorization } from '../middleware/authorization'
import { S3AssetPack, getFileUploader, ACL } from '../S3'
import { AssetPack } from '../AssetPack'
import { Asset } from './Asset.model'

export class AssetRouter extends Router {
  assetFilesRequestHandler:
    | ((req: Request, res: Response) => Promise<boolean>) // Promisified RequestHandler
    | undefined

  mount() {
    const assetPackExists = modelExists(AssetPack, 'assetPackId')
    const assetPackAuthorization = modelAuthorization(AssetPack, 'assetPackId')

    this.assetFilesRequestHandler = this.getAssetFilesRequestHandler()

    /**
     * Upload the files for each asset in an asset pack
     */
    // TODO: Check asset belongs to asset pack
    this.router.post(
      '/assetPacks/:assetPackId/assets/:id/files',
      authentication,
      assetPackExists,
      assetPackAuthorization,
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

      await Promise.all([
        AssetPack.hardDelete({ id: assetPackId }),
        new S3AssetPack(assetPackId).delete()
      ])
      throw new HTTPError('An error occurred trying to upload asset files', {
        message: error.message
      })
    }
  }

  private getAssetFilesRequestHandler() {
    const uploader = getFileUploader(
      ACL.publicRead,
      [],
      (req: AuthRequest, file, callback) => {
        try {
          const assetPackId = server.extractFromReq(req, 'assetPackId')
          const id = server.extractFromReq(req, 'id')

          const filename = file.fieldname

          callback(
            null,
            new S3AssetPack(assetPackId).getAssetFileKey(id, filename)
          )
        } catch (error) {
          callback(error, '')
        }
      }
    )
    return utils.promisify<boolean>(uploader.any())
  }
}
