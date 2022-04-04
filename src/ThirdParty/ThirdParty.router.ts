import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { AuthRequest, withAuthentication } from '../middleware/authentication'
import { thirdPartyAPI } from '../ethereum/api/thirdParty'
import { ThirdParty } from './ThirdParty.types'
import { ThirdPartyService } from './ThirdParty.service'
import { NonExistentThirdPartyError } from './ThirdParty.errors'

export class ThirdPartyRouter extends Router {
  private thirdPartyService = new ThirdPartyService()
  mount() {
    /**
     * Get third party records
     */
    this.router.get(
      '/thirdParties',
      withAuthentication,
      server.handleRequest(this.getThirdParties)
    )
    /**
     * Get third party available slots
     */
    this.router.get(
      '/thirdParties/:id/slots',
      withAuthentication,
      server.handleRequest(this.getThirdPartyAvailableSlots)
    )
    /**
     * Get a third party by id
     */
    this.router.get(
      '/thirdParties/:id',
      server.handleRequest(this.getThirdParty)
    )
  }

  getThirdParties = async (req: AuthRequest): Promise<ThirdParty[]> => {
    let manager: string | undefined
    try {
      manager = server.extractFromReq(req, 'manager')
    } catch (e) {
      // We support empty manager filters on the query string
    }
    return this.thirdPartyService.getThirdParties(manager)
  }

  getThirdParty = async (req: AuthRequest): Promise<ThirdParty> => {
    const thirdPartyId = server.extractFromReq(req, 'id')
    try {
      return await this.thirdPartyService.getThirdParty(thirdPartyId)
    } catch (error) {
      if (error instanceof NonExistentThirdPartyError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.notFound
        )
      }

      throw error
    }
  }

  getThirdPartyAvailableSlots = async (req: AuthRequest): Promise<number> => {
    const thirdPartyId = server.extractFromReq(req, 'id')
    const eth_address = req.auth.ethAddress
    if (!(await thirdPartyAPI.isManager(thirdPartyId, eth_address))) {
      throw new HTTPError(
        'Unauthorized access. Account is not manager of the collection',
        { eth_address },
        STATUS_CODES.unauthorized
      )
    }

    const availableSlots = await this.thirdPartyService.getThirdPartyAvailableSlots(
      thirdPartyId
    )
    return availableSlots
  }
}
