import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { withCors } from '../middleware/cors'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { AuthRequest, withAuthentication } from '../middleware/authentication'
import { withSchemaValidation } from '../middleware'
import { ThirdParty, UpdateVirtualThirdPartyBody } from './ThirdParty.types'
import { ThirdPartyService } from './ThirdParty.service'
import {
  NonExistentThirdPartyError,
  OnlyDeletableIfOnGraphError,
  UnauthorizedThirdPartyManagerError,
} from './ThirdParty.errors'
import { UpdateVirtualThirdPartyBodySchema } from './ThirdParty.schema'

export class ThirdPartyRouter extends Router {
  mount() {
    /**
     * CORS for the OPTIONS header
     */
    this.router.options('/thirdParties', withCors)
    this.router.options('/thirdParties/:id', withCors)
    this.router.options('/thirdParties/:id/slots', withCors)

    /**
     * Get third party records
     */
    this.router.get(
      '/thirdParties',
      withCors,
      withAuthentication,
      server.handleRequest(this.getThirdParties)
    )
    /**
     * Get third party available slots
     */
    this.router.get(
      '/thirdParties/:id/slots',
      withCors,
      withAuthentication,
      server.handleRequest(this.getThirdPartyAvailableSlots)
    )
    /**
     * Get a third party by id
     */
    this.router.get(
      '/thirdParties/:id',
      withCors,
      server.handleRequest(this.getThirdParty)
    )
    /**
     * Remove a virtual third party that has already been added to the graph
     */
    this.router.delete(
      '/thirdParties/:id',
      withCors,
      withAuthentication,
      server.handleRequest(this.removeVirtualThirdParty)
    )
    /**
     * Updates a virtual third party
     */
    this.router.patch(
      '/thirdParties/:id',
      withCors,
      withAuthentication,
      withSchemaValidation(UpdateVirtualThirdPartyBodySchema),
      server.handleRequest(this.updateThirdParty)
    )
  }

  getThirdParties = async (req: AuthRequest): Promise<ThirdParty[]> => {
    let manager: string | undefined
    try {
      manager = server.extractFromReq(req, 'manager')
    } catch (e) {
      // We support empty manager filters on the query string
    }
    return ThirdPartyService.getThirdParties(manager)
  }

  getThirdParty = async (req: AuthRequest): Promise<ThirdParty> => {
    const thirdPartyId = server.extractFromReq(req, 'id')
    try {
      return await ThirdPartyService.getThirdParty(thirdPartyId)
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
    if (!(await ThirdPartyService.isManager(thirdPartyId, eth_address))) {
      throw new HTTPError(
        'Unauthorized access. Account is not manager of the collection',
        { eth_address },
        STATUS_CODES.unauthorized
      )
    }

    const availableSlots = await ThirdPartyService.getThirdPartyAvailableSlots(
      thirdPartyId
    )
    return availableSlots
  }

  removeVirtualThirdParty = async (req: AuthRequest): Promise<void> => {
    const thirdPartyId = server.extractFromReq(req, 'id')
    const eth_address = req.auth.ethAddress
    try {
      await ThirdPartyService.removeVirtualThirdParty(thirdPartyId, eth_address)
    } catch (error) {
      if (error instanceof NonExistentThirdPartyError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.notFound
        )
      } else if (error instanceof UnauthorizedThirdPartyManagerError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.unauthorized
        )
      } else if (error instanceof OnlyDeletableIfOnGraphError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.badRequest
        )
      }

      throw error
    }
  }

  updateThirdParty = async (req: AuthRequest): Promise<void> => {
    const thirdPartyId = server.extractFromReq(req, 'id')
    const eth_address = req.auth.ethAddress
    const updateThirdPartyBody = req.body as UpdateVirtualThirdPartyBody
    try {
      await ThirdPartyService.updateVirtualThirdParty(
        thirdPartyId,
        eth_address,
        updateThirdPartyBody
      )
    } catch (error) {
      if (error instanceof NonExistentThirdPartyError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.notFound
        )
      } else if (error instanceof UnauthorizedThirdPartyManagerError) {
        throw new HTTPError(
          error.message,
          { id: error.id },
          STATUS_CODES.unauthorized
        )
      }

      throw error
    }
  }
}
