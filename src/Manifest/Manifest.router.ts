import { server } from 'decentraland-server'
import { Request, Response } from 'express'

import { Router } from '../common/Router'
import { withCors, withPermissiveCors } from '../middleware/cors'
import {
  withModelAuthorization,
  withAuthentication,
  withModelExists,
  AuthRequest,
} from '../middleware'
import { Project, TemplateStatus } from '../Project'
import { S3Project, MANIFEST_FILENAME, getBucketURL } from '../S3'
import { SearchableProject } from '../Project/SearchableProject'
import { ManifestAttributes } from './Manifest.types'

export class ManifestRouter extends Router {
  mount() {
    const withProjectExists = withModelExists(Project, 'id', {
      is_deleted: false,
    })
    const withPublicProjectExists = withModelExists(Project, 'id', {
      is_public: true,
      is_deleted: false,
    })
    const withProjectAuthorization = withModelAuthorization(Project)
    const withTemplateExists = withModelExists(Project, 'id', {
      is_deleted: false,
      is_template: true,
      template_status: TemplateStatus.ACTIVE,
    })

    /**
     * CORS for the OPTIONS header
     */
    this.router.options('/projects/:id/manifest', withPermissiveCors)
    this.router.options('/manifests', withCors)
    this.router.options('/publics/:id/manifest', withPermissiveCors)
    this.router.options('/templates/:id/manifest', withPermissiveCors)

    /**
     * Returns the manifest of a project
     */
    this.router.get(
      '/projects/:id/manifest',
      withPermissiveCors,
      withAuthentication,
      withProjectExists,
      withProjectAuthorization,
      this.getProjectManifest
    )

    /**
     * Returns the manifest of a land coordinates associated project  (Builder In World)
     */
    this.router.get(
      '/manifests',
      withCors,
      withAuthentication,
      server.handleRequest(this.getManifests)
    )

    this.router.get(
      '/publics/:id/manifest',
      withPermissiveCors,
      withPublicProjectExists,
      this.getProjectManifest
    )

    /**
     * Returns the manifest of a template
     */
    this.router.get(
      '/templates/:id/manifest',
      withPermissiveCors,
      withTemplateExists,
      this.getProjectManifest
    )

    this.router.delete(
      '/projects/:id/manifest',
      withPermissiveCors,
      withAuthentication,
      withProjectAuthorization,
      server.handleRequest(this.deleteManifest)
    )
  }

  getProjectManifest = (req: Request, res: Response) => {
    const id = server.extractFromReq(req, 'id')
    const project = new S3Project(id)
    res.setHeader('Cache-Control', 'no-cache')
    return res.redirect(
      `${getBucketURL()}/${project.getFileKey(MANIFEST_FILENAME)}`,
      301
    )
  }

  async getManifests(req: AuthRequest) {
    let eth_address = req.auth.ethAddress

    const projectSearcher = new SearchableProject(req)
    const projects = await projectSearcher.searchByEthAddress(eth_address)
    let manifests: ManifestAttributes[] = []
    if (projects) {
      for (const project of projects.items) {
        const body = await new S3Project(project.id).readFileBody(
          MANIFEST_FILENAME
        )

        if (body) {
          manifests.push(JSON.parse(body.toString()) as ManifestAttributes)
        }
      }

      if (manifests) return manifests
    }
    return manifests
  }

  async deleteManifest(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    await new S3Project(id).deleteFile(MANIFEST_FILENAME)
    return true
  }
}
