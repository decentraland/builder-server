import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { authentication, AuthRequest, projectExists } from '../middleware'
import { projectAuthorization } from '../middleware/authorization'
import { RequestParameters } from '../RequestParameters'
import {
  SearchableModel,
  SearchableParameters,
  SearchableConditions
} from '../Searchable'
import { Pool } from './Pool.model'
import { PoolAttributes, searchablePoolProperties } from './Pool.types'

export class PoolRouter extends Router {
  mount() {
    /**
     * Get all pools
     */
    this.router.get(
      '/pools',
      authentication,
      server.handleRequest(this.getPools)
    )

    /**
     * Get pool
     */
    this.router.get(
      '/projects/:id/pool',
      authentication,
      projectExists,
      projectAuthorization,
      server.handleRequest(this.getPool)
    )

    /**
     * Upsert a new pool
     */
    this.router.put(
      '/projects/:id/pool',
      authentication,
      projectExists,
      projectAuthorization,
      server.handleRequest(this.upsertPool)
    )
  }

  async getPools(req: AuthRequest) {
    const user_id = req.auth.sub

    // TODO: This is the same code as Project.router#getProjects
    const requestParameters = new RequestParameters(req)
    const searchableProject = new SearchableModel<PoolAttributes>(
      Pool.tableName
    )
    const parameters = new SearchableParameters<PoolAttributes>(
      requestParameters,
      { sort: { by: searchablePoolProperties } }
    )
    const conditions = new SearchableConditions<PoolAttributes>(
      requestParameters,
      { eq: searchablePoolProperties }
    )
    conditions.addExtras('eq', { user_id })

    return searchableProject.search(parameters, conditions)
  }

  async getPool(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const user_id = req.auth.sub

    return Pool.findOne({ id, user_id })
  }

  async upsertPool(req: AuthRequest) {
    // Grab project by id
    // Copy table
    // Copy manifest
    const id = server.extractFromReq(req, 'id')
    const user_id = req.auth.sub

    return { id, user_id }
    // return new Pool(attributes).upsert()
  }
}
