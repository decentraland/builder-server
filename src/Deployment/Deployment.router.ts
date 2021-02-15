import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { HTTPError } from '../common/HTTPError'
import { getValidator } from '../utils/validator'
import {
  withModelAuthorization,
  withAuthentication,
  withModelExists,
  AuthRequest,
} from '../middleware'
import { Project } from '../Project'
import { Deployment } from './Deployment.model'
import { DeploymentAttributes, deploymentSchema } from './Deployment.types'

const validator = getValidator()

const withProjectExists = withModelExists(Project, 'id', {
  is_deleted: false,
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
    const eth_address = req.auth.ethAddress
    return Deployment.find<DeploymentAttributes>({ eth_address })
  }

  async getProjectDeployment(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const eth_address = req.auth.ethAddress
    return Deployment.findOne<DeploymentAttributes>({ id, eth_address })
  }

  async upsertDeployment(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const deploymentJSON: any = server.extractFromReq(req, 'deployment')
    const eth_address = req.auth.ethAddress

    const validate = validator.compile(deploymentSchema)
    validate(deploymentJSON)

    if (validate.errors) {
      throw new HTTPError('Invalid schema', validate.errors)
    }

    const attributes = {
      ...deploymentJSON,
      eth_address,
    } as DeploymentAttributes

    if (id !== attributes.id) {
      throw new HTTPError('The body and URL deployment ids do not match', {
        urlId: id,
        bodyId: attributes.id,
      })
    }

    return new Deployment(attributes).upsert()
  }

  async deleteDeployment(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const eth_address = req.auth.ethAddress

    await Deployment.delete({ id, eth_address })

    return true
  }
}
