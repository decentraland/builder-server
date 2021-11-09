import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { AuthRequest, withAuthentication } from '../middleware/authentication'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { ThirdParty } from './ThirdParty.types'
import { toThirdParty } from './utils'

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

  async getThirdParties(req: AuthRequest): Promise<ThirdParty[]> {
    let manager: string | undefined
    try {
      manager = server.extractFromReq(req, 'manager')
    } catch (e) {
      // We support empty manager filters on the query string
    }
    const fragments = await thirdPartyAPI.fetchThirdParties(manager)
    return fragments.map(toThirdParty)
  }
}
