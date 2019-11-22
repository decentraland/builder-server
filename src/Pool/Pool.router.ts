import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { withAuthentication, withModelExists, AuthRequest } from '../middleware'
import { withModelAuthorization } from '../middleware/authorization'
import { S3Project, MANIFEST_FILENAME, POOL_FILENAME, ACL } from '../S3'
import { RequestParameters } from '../RequestParameters'
import { Project, ProjectAttributes } from '../Project'
import {
  SearchableModel,
  SearchableParameters,
  SearchableConditions
} from '../Searchable'
import { Pool } from './Pool.model'
import {
  PoolAttributes,
  searchablePoolProperties,
  sortablePoolProperties
} from './Pool.types'
import { PoolGroup } from '../PoolGroup'

export class PoolRouter extends Router {
  mount() {
    const withProjectExists = withModelExists(Project)
    const withProjectAuthorization = withModelAuthorization(Project)

    /**
     * Get all pools
     */
    this.router.get('/pools', server.handleRequest(this.getPools))

    /**
     * Get pool
     */
    this.router.get('/projects/:id/pool', server.handleRequest(this.getPool))

    /**
     * Upsert a new pool
     */
    this.router.put(
      '/projects/:id/pool',
      withAuthentication,
      withProjectExists,
      withProjectAuthorization,
      server.handleRequest(this.upsertPool)
    )
  }

  async getPools(req: AuthRequest) {
    // TODO: This is the same code as Project.router#getProjects
    const requestParameters = new RequestParameters(req)
    const searchableProject = new SearchableModel<PoolAttributes>(
      Pool.tableName
    )
    const parameters = new SearchableParameters<PoolAttributes>(
      requestParameters,
      sortablePoolProperties
    )
    const conditions = new SearchableConditions<PoolAttributes>(
      requestParameters,
      searchablePoolProperties
    )

    const user_id = requestParameters.get('user_id', null)
    if (user_id === 'me') {
      conditions.addExtras('eq', { user_id: req.auth.sub })
    } else if (user_id) {
      conditions.addExtras('eq', { user_id })
    }

    if (requestParameters.has('group')) {
      const groups = requestParameters.getInteger('group')
      conditions.addExtras('includes', { groups })
    }

    return searchableProject.search(parameters, conditions)
  }

  async getPool(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    return Pool.findOne({ id })
  }

  async upsertPool(req: AuthRequest) {
    const parameters = new RequestParameters(req)
    const id = parameters.getString('id')
    const s3Project = new S3Project(id)
    const groupId = parameters.getInteger('group', 0)

    const [project, manifest, pool, group] = await Promise.all([
      Project.findOne<ProjectAttributes>(id),
      s3Project.readFileBody(MANIFEST_FILENAME),
      Pool.findOne<PoolAttributes>(id),
      PoolGroup.findOneByFilters({ id: groupId, activeOnly: true })
    ])

    const { is_public, ...upsertPool } = (project || {}) as ProjectAttributes

    const groups = (pool && pool.groups) || []
    if (group && group.id && !groups.includes(group.id)) {
      groups.push(group.id)
    }

    const promises: Promise<any>[] = [
      new Pool({
        ...upsertPool,
        groups
      } as any).upsert()
    ]

    if (manifest) {
      const data = manifest.toString()
      promises.push(s3Project.saveFile(POOL_FILENAME, data, ACL.private))
    }

    const [result] = await Promise.all(promises)
    return result as ProjectAttributes
  }
}
