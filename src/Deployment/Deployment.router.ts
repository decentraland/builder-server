import { server } from 'decentraland-server'
import Ajv from 'ajv'

import { Router } from '../common/Router'
import { HTTPError } from '../common/HTTPError'
import { auth, AuthRequest } from '../middleware/auth'
import { Deployment } from './Deployment.model'
import { DeploymentAttributes, deploymentSchema } from './Deployment.types'

const ajv = new Ajv()

export class DeploymentRouter extends Router {
  mount() {
    /**
     * Get all deployments
     */
    this.router.get(
      '/deployments',
      auth,
      server.handleRequest(this.getDeployments)
    )

    /**
     * Upsert a deployment
     */
    this.router.put(
      '/deployments/:id',
      auth,
      server.handleRequest(this.upsertDeployment)
    )

    /**
     * Delete deployment
     */
    this.router.delete(
      '/deployments/:id',
      auth,
      server.handleRequest(this.deleteDeployment)
    )
  }

  async getDeployments(req: AuthRequest) {
    const user_id = req.auth.sub
    return Deployment.find<DeploymentAttributes>({ user_id })
  }

  async upsertDeployment(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const deploymentJSON: any = server.extractFromReq(req, 'deployment')
    const user_id = req.auth.sub

    const validator = ajv.compile(deploymentSchema)
    validator(deploymentJSON)

    if (validator.errors) {
      throw new HTTPError('Invalid schema', validator.errors)
    }

    const attributes = { ...deploymentJSON, user_id } as DeploymentAttributes

    if (id !== attributes.id) {
      throw new HTTPError('The body and URL deployment ids do not match', {
        urlId: id,
        bodyId: attributes.id
      })
    }

    return new Deployment(attributes).upsert()
  }

  async deleteDeployment(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const user_id = req.auth.sub

    if (!(await Deployment.isOwnedBy(id, user_id))) {
      throw new HTTPError(`Invalid deployment id`, { id, user_id })
    }

    const { rowCount } = await Deployment.delete({ id })

    return { rowCount }
  }
}
