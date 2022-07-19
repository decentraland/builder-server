import multer from 'multer'
import { Request } from 'express'
import { server } from 'decentraland-server'
import { Router } from '../common/Router'
import { HTTPError } from '../common/HTTPError'
import { getCID } from '../utils/cid'
import {
  withModelExists,
  asMiddleware,
  withModelAuthorization,
} from '../middleware'
import { S3Content, S3AssetPack, uploadRequestFiles } from '../S3'
import { AssetPack } from '../AssetPack'
import { Asset } from './Asset.model'
import { withAuthentication } from '../middleware/authentication'

export class AssetRouter extends Router {
  mount() {
    const withAssetExists = withModelExists(Asset)
    const withAssetPackExists = withModelExists(AssetPack, 'assetPackId')
    const withAssetPackAuthorization = withModelAuthorization(
      AssetPack,
      'assetPackId'
    )

    /**
     * Upload the files for each asset in an asset pack
     */
    this.router.post(
      '/assetPacks/:assetPackId/assets/:id/files',
      withAuthentication,
      withAssetPackExists,
      withAssetPackAuthorization,
      asMiddleware(this.assetBelongsToPackMiddleware),
      multer().any(),
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

  uploadAssetFiles = async (req: Request) => {
    try {
      await uploadRequestFiles(req.files, async (file) => {
        const hash = await getCID({
          path: file.originalname,
          content: file.buffer,
          size: file.size,
        })
        if (hash !== file.fieldname) {
          throw new Error(
            'The CID supplied does not correspond to the actual hash of the file'
          )
        }
        return new S3Content().getFileKey(hash)
      })
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
        message: (error as Error).message,
      })
    }
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
