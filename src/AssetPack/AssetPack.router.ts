import { server } from 'decentraland-server'
// import Ajv from 'ajv'

import { Router } from '../common/Router'
// import { HTTPError } from '../common/HTTPError'
import { authentication, AuthRequest } from '../middleware'
import { AssetPack } from './AssetPack.model'

// const ajv = new Ajv()

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
  }

  async getAssetPacks(req: AuthRequest) {
    const user_id = req.auth.sub
    return AssetPack.findVisible(user_id)
  }

  async getAssetPack(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    return AssetPack.findWithAssets(id)
  }
}
