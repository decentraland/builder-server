import { server } from 'decentraland-server'
import { Router } from '../common/Router'
import { withAuthentication, AuthRequest } from '../middleware/authentication'
import { Project } from './Project.model'

export class ProjectByCoordRouter extends Router {
  mount() {
    /**
     * Update all projects with coords to null
     */
    this.router.delete(
      '/projects_by_coords/:coords/coords',
      withAuthentication,
      server.handleRequest(this.removeCoordsFromProjects)
    )
  }

  async removeCoordsFromProjects(req: AuthRequest) {
    const eth_address = req.auth.ethAddress
    const creation_coords = server.extractFromReq(req, 'coords')
    await Project.update(
      { updated_at: new Date(), creation_coords: undefined },
      { creation_coords, eth_address }
    )
    return true
  }
}
