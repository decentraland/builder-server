import { server } from 'decentraland-server'
import Ajv from 'ajv'

import { Router } from '../common/Router'
import { HTTPError } from '../common/HTTPError'
import { withAuthentication, withModelExists, AuthRequest } from '../middleware'
import { withModelAuthorization } from '../middleware/authorization'
import { Project } from '../Project'
import { Deployment } from './Deployment.model'
import { DeploymentAttributes, deploymentSchema } from './Deployment.types'

const ajv = new Ajv()

const withProjectExists = withModelExists(Project, 'id', {
  is_deleted: false
})
const withProjectAuthorization = withModelAuthorization(Project)
const withDeploymentAuthorization = withModelAuthorization(Deployment)

export class DeploymentRouter extends Router {
  mount() {
    /**
     * Get all deployments
     */
    this.router.get(
      '/deployments',
      withAuthentication,
      server.handleRequest(this.getDeployments)
    )

    /**
     * Get a projects deployment
     */
    this.router.get(
      '/projects/:id/deployment',
      withAuthentication,
      withProjectExists,
      withProjectAuthorization,
      server.handleRequest(this.getProjectDeployment)
    )

    /**
     * Upsert a project deployment
     */
    this.router.put(
      '/projects/:id/deployment',
      withAuthentication,
      withProjectExists,
      withProjectAuthorization,
      server.handleRequest(this.upsertDeployment)
    )

    /**
     * Delete project deployment
     */
    this.router.delete(
      '/projects/:id/deployment',
      withAuthentication,
      withProjectExists,
      withProjectAuthorization,
      withDeploymentAuthorization,
      server.handleRequest(this.deleteDeployment)
    )
  }

  async getDeployments(req: AuthRequest) {
    const user_id = req.auth.sub
    return Deployment.find<DeploymentAttributes>({ user_id })
  }

  async getProjectDeployment(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const user_id = req.auth.sub
    return Deployment.findOne<DeploymentAttributes>({ id, user_id })
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

    await Deployment.delete({ id, user_id })

    return true
  }
}
