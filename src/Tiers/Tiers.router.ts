import { server } from 'decentraland-server'
import { Router } from '../common/Router'
import { TierFragment } from '../ethereum/api/fragments'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'

export class TiersRouter extends Router {
  mount() {
    /**
     * Get all third party tiers
     */
    this.router.get('/tiers/thirdParty', server.handleRequest(this.getTiers))
  }

  getTiers(): Promise<TierFragment[]> {
    return thirdPartyAPI.fetchTiers()
  }
}
