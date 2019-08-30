import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { authentication, AuthRequest } from '../middleware'
import { AssetPack } from './AssetPack.model'

export class AssetPackRouter extends Router {
  mount() {
    /**
     * Get all asset packs
     */
    this.router.get(
      '/assetPacks',
      authentication,
      server.handleRequest(this.getAssetPacks)
    )

    /**
     * Get asset pack
     */
    this.router.get(
      '/assetPacks/:id',
      authentication,
      server.handleRequest(this.getAssetPack)
    )

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
    const user_id = req.auth.sub
    return AssetPack.findVisible(user_id)
  }

  async getAssetPack(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const user_id = req.auth.sub
    return AssetPack.findWithAssets(id, user_id)
  }

  async deleteAssetPack(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const user_id = req.auth.sub
    await AssetPack.delete({ id, user_id })
    return true
  }
}
