import { server } from 'decentraland-server'
import { Router } from '../common/Router'
import { withCors } from '../middleware/cors'
import { TierFragment } from '../ethereum/api/fragments'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'

export class TiersRouter extends Router {
  mount() {
    /**
     * CORS for the OPTIONS header
     */
    this.router.options('/tiers/thirdParty', withCors)

    /**
     * Get all third party tiers
     */
    this.router.get(
      '/tiers/thirdParty',
      withCors,
      server.handleRequest(this.getTiers)
    )
  }

  getTiers(): Promise<TierFragment[]> {
    return thirdPartyAPI.fetchTiers()
  }
}
