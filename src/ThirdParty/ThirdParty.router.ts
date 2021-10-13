import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { withAuthentication, AuthRequest } from '../middleware/authentication'
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

  async getThirdParties(req: AuthRequest): Promise<ThirdPartyFragment[]> {
    let manager = ''
    try {
      manager = server.extractFromReq(req, 'manager')
    } catch (e) {}

    return thirdPartyAPI.fetchThirdParties(manager)
  }
}
