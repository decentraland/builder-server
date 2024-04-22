import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { withCors } from '../middleware/cors'
import { RequestParameters } from '../RequestParameters'
import { PoolGroup } from './PoolGroup.model'
import { Request } from 'express'

export class PoolGroupRouter extends Router {
  mount() {
    /**
     * CORS for the OPTIONS header
     */
    this.router.options('/pools/groups', withCors)

    /**
     * Get all pool groups
     */
    this.router.get(
      '/pools/groups',
      withCors,
      server.handleRequest(this.getPoolGroups)
    )
  }

  async getPoolGroups(req: Request) {
    // TODO: This is the same code as Project.router#getProjects
    const requestParameters = new RequestParameters(req)

    const activeOnly = requestParameters.getBoolean('active_only', false)

    return PoolGroup.findByFilters({ activeOnly })
  }
}
