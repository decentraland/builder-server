import { server } from 'decentraland-server'
import { Router } from '../common/Router'
import { withCors } from '../middleware/cors'
import { withModelExists } from '../middleware'
import { getDefaultEthAddress } from '../AssetPack/utils'
import { Asset } from './Asset.model'
import { withAuthentication, AuthRequest } from '../middleware/authentication'

const DEFAULT_ETH_ADDRESS = getDefaultEthAddress()

export class AssetRouter extends Router {
  mount() {
    const withAssetExists = withModelExists(Asset)

    /**
     * CORS for the OPTIONS header
     */
    this.router.options('/assets/:id', withCors)
    this.router.options('/assets', withCors)

    /**
     * Get a single asset
     */
    this.router.get(
      '/assets/:id',
      withCors,
      withAuthentication,
      withAssetExists,
      server.handleRequest(this.getAsset)
    )

    /**
     * Get a multiple assets
     */
    this.router.get(
      '/assets',
      withCors,
      withAuthentication,
      server.handleRequest(this.getAssets)
    )
  }

  private async getAsset(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const eth_address = req.auth.ethAddress
    const [asset] = await Asset.findByIds(
      [id],
      [eth_address, DEFAULT_ETH_ADDRESS]
    )
    return asset ?? null
  }

  private async getAssets(req: AuthRequest) {
    const reqIds = server.extractFromReq<string | string[]>(req, 'id')
    const ids: string[] = Array.isArray(reqIds) ? reqIds : [reqIds]
    const eth_address = req.auth.ethAddress
    return Asset.findByIds(ids, [eth_address, DEFAULT_ETH_ADDRESS])
  }
}
