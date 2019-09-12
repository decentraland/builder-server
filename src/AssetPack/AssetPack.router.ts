import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { authentication, AuthRequest } from '../middleware'
import { AssetPack } from './AssetPack.model'

export class AssetPackRouter extends Router {
  mount() {
    /**
     * Get all asset packs
     */
    this.router.get('/assetPacks', server.handleRequest(this.getAssetPacks))

    /**
     * Get asset pack
     */
    this.router.get('/assetPacks/:id', server.handleRequest(this.getAssetPack))

    /**
     * Delete asset pack
     */
    this.router.delete(
      '/assetPacks/:id',
      authentication,
      server.handleRequest(this.deleteAssetPack)
    )
  }

  async getAssetPacks(req: AuthRequest) {
    const user_id = req.auth ? req.auth.sub : ''
    return AssetPack.findVisible(user_id)
  }

  async getAssetPack(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const user_id = req.auth ? req.auth.sub : ''

    const isVisible = await AssetPack.isVisible(id, user_id)

    if (!isVisible) {
      throw new HTTPError(
        'Unauthorized user',
        { user_id },
        STATUS_CODES.unauthorized
      )
    }

    const assetPack = await AssetPack.findWithAssets(id)

    if (!assetPack) {
      throw new HTTPError(
        'Asset pack not found',
        { id, user_id },
        STATUS_CODES.notFound
      )
    }

    return assetPack
  }

  async deleteAssetPack(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const user_id = req.auth.sub
    await AssetPack.delete({ id, user_id })
    return true
  }
}
