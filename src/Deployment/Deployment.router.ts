import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { withCors } from '../middleware/cors'
import {
  withModelAuthorization,
  withAuthentication,
  withModelExists,
  AuthRequest,
} from '../middleware'
import { Project } from '../Project'
import { Deployment } from './Deployment.model'
import { DeploymentAttributes } from './Deployment.types'

const withProjectExists = withModelExists(Project, 'id', {
  is_deleted: false,
})
const withProjectAuthorization = withModelAuthorization(Project)
const withDeploymentAuthorization = withModelAuthorization(Deployment)

export class DeploymentRouter extends Router {
  mount() {
    /**
     * CORS for the OPTIONS header
     */
    this.router.options('/deployments', withCors)
    this.router.options('/projects/:id/deployment', withCors)

    /**
     * Get all deployments
     */
    this.router.get(
      '/deployments',
      withCors,
      withAuthentication,
      server.handleRequest(this.getDeployments)
    )

    /**
     * Get a projects deployment
     */
    this.router.get(
      '/projects/:id/deployment',
      withCors,
      withAuthentication,
      withProjectExists,
      withProjectAuthorization,
      server.handleRequest(this.getProjectDeployment)
    )

    /**
     * Delete project deployment
     */
    this.router.delete(
      '/projects/:id/deployment',
      withCors,
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

  async deleteDeployment(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const eth_address = req.auth.ethAddress

    await Deployment.delete({ id, eth_address })

    return true
  }
}
