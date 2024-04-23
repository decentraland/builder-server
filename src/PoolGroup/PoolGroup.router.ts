import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { RequestParameters } from '../RequestParameters'
import { PoolGroup } from './PoolGroup.model'
import { Request } from 'express'

export class PoolGroupRouter extends Router {
  mount() {
    /**
     * Get all pool groups
     */
    this.router.get('/pools/groups', server.handleRequest(this.getPoolGroups))
  }

  async getPoolGroups(req: Request) {
    // TODO: This is the same code as Project.router#getProjects
    const requestParameters = new RequestParameters(req)

    const activeOnly = requestParameters.getBoolean('active_only', false)

    return PoolGroup.findByFilters({ activeOnly })
  }
}
