import { Request } from 'express'
import { server } from 'decentraland-server'
import { hashV1 } from '@dcl/hashing'
import { Router } from '../common/Router'
import { withCors } from '../middleware/cors'
import {
  withModelExists,
  asMiddleware,
  withModelAuthorization,
} from '../middleware'
import { getUploader, S3Content } from '../S3'
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
     * CORS for the OPTIONS header
     */
    this.router.options('/assetPacks/:assetPackId/assets/:id/files', withCors)
    this.router.options('/assets/:id', withCors)
    this.router.options('/assets', withCors)

    /**
     * Upload the files for each asset in an asset pack
     */
    this.router.post(
      '/assetPacks/:assetPackId/assets/:id/files',
      withCors,
      withAuthentication,
      withAssetPackExists,
      withAssetPackAuthorization,
      asMiddleware(this.assetBelongsToPackMiddleware),
      getUploader({
        getFileStreamKey: async (file) => {
          const hash = await hashV1(file.stream)
          return new S3Content().getFileKey(hash)
        },
      }).any(),
      server.handleRequest(this.uploadAssetFiles)
    )

    /**
     * Get a single asset
     */
    this.router.get(
      '/assets/:id',
      withCors,
      withAssetExists,
      server.handleRequest(this.getAsset)
    )

    /**
     * Get a multiple assets
     */
    this.router.get('/assets', withCors, server.handleRequest(this.getAssets))
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

  uploadAssetFiles = () => {
    // This handler is only here so `server.handleRequest` has a valid callback and it can return the appropiate formated response
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
