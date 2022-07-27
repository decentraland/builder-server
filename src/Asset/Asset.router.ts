import { Request } from 'express'
import { server } from 'decentraland-server'
import { hashV1 } from '@dcl/hashing'
import { Router } from '../common/Router'
import {
  withModelExists,
  asMiddleware,
  withModelAuthorization,
} from '../middleware'
import { getUploader } from '../S3'
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
      getUploader({
        getFileKey: (file) => hashV1(file.stream),
      }).any(),
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

  uploadAssetFiles = (req: Request) => {
    // This handler is only here so `server.handleRequest` has a valid callback and it can return the appropiate formated response
    console.log('===========================================')
    console.log(req.files)
    console.log('===========================================')
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
