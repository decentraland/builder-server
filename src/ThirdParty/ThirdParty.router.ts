import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { withAuthentication } from '../middleware/authentication'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { ThirdPartyFragment } from '../ethereum/api/fragments'

export class ThirdPartyRouter extends Router {
  mount() {
    /**
     * Get third party records
     */
    this.router.get(
      '/thirdParties',
      withAuthentication,
      server.handleRequest(this.getThirdParties)
    )
  }

  async getThirdParties(): Promise<ThirdPartyFragment[]> {
    return thirdPartyAPI.fetchThirdParties()
  }
}
