import { server } from 'decentraland-server'

import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { getValidator } from '../utils/validator'
import {
  withModelAuthorization,
  withAuthentication,
  withModelExists,
  AuthRequest,
} from '../middleware'
import { Ownable } from '../Ownable'
import { Project } from '../Project'
import { ManifestAttributes, manifestSchema } from './Manifest.types'
import { S3Project, MANIFEST_FILENAME, POOL_FILENAME, ACL } from '../S3'
import { collectStatistics } from './utils'
import { SearchableProject } from '../Project/SearchableProject'

const validator = getValidator()

export class ManifestRouter extends Router {
  mount() {
    const withProjectExists = withModelExists(Project, 'id', {
      is_deleted: false,
    })
    const withPublishedProjectExists = withModelExists(Project)
    const withProjectAuthorization = withModelAuthorization(Project)

    /**
     * Returns the manifest of a project
     */
    this.router.get(
      '/projects/:id/manifest',
      withAuthentication,
      withProjectExists,
      withProjectAuthorization,
      server.handleRequest(this.getProjectManifest)
    )

    /**
     * Returns the manifest of a land coordinates associated project  (Builder In World)
     */
    this.router.get(
      '/manifests',
      withAuthentication,
      server.handleRequest(this.getManifests)
    )

    /**
     * Returns the manifest of a pool
     */
    this.router.get(
      '/publics/:id/manifest',
      withProjectExists,
      server.handleRequest(this.getProjectManifest)
    )

    /**
     * Returns the manifest of a pool
     */
    this.router.get(
      '/pools/:id/manifest',
      withPublishedProjectExists,
      server.handleRequest(this.getPoolManifest)
    )

    /**
     * Upserts the manifest and the project inside of it
     * Important! Project authorization is done inside the handler because the manifest upserts the project
     */
    this.router.put(
      '/projects/:id/manifest',
      withAuthentication,
      server.handleRequest(this.upsertManifest)
    )

    /**
     * Upserts the manifest and the project inside of it
     */
    this.router.delete(
      '/projects/:id/manifest',
      withAuthentication,
      withProjectAuthorization,
      server.handleRequest(this.deleteManifest)
    )
  }

  async getProjectManifest(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')

    const body = await new S3Project(id).readFileBody(MANIFEST_FILENAME)
    if (body) {
      return JSON.parse(body.toString())
    }
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

  async getPublicProjectManifest(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const body = await new S3Project(id).readFileBody(MANIFEST_FILENAME)
    if (body) {
      return JSON.parse(body.toString())
    }
  }

  async getPoolManifest(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const body = await new S3Project(id).readFileBody(POOL_FILENAME)
    if (body) {
      return JSON.parse(body.toString())
    }
  }

  async upsertManifest(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const manifestJSON: any = server.extractFromReq(req, 'manifest')
    const eth_address = req.auth.ethAddress

    const validate = validator.compile(manifestSchema)
    validate(manifestJSON)

    if (validate.errors) {
      throw new HTTPError('Invalid schema', validate.errors)
    }

    const canUpsert = await new Ownable(Project).canUpsert(id, eth_address)
    if (!canUpsert) {
      throw new HTTPError(
        'Unauthorized user',
        { id, eth_address },
        STATUS_CODES.unauthorized
      )
    }

    const manifest = {
      ...manifestJSON,
      project: { ...manifestJSON.project, eth_address },
    } as ManifestAttributes

    const statistics = collectStatistics(manifest)

    const [project] = await Promise.all([
      new Project({ ...manifest.project, ...statistics }).upsert(),
      new S3Project(id).saveFile(
        MANIFEST_FILENAME,
        JSON.stringify(manifest),
        ACL.private
      ),
    ])
    return project
  }

  async deleteManifest(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    await new S3Project(id).deleteFile(MANIFEST_FILENAME)
    return true
  }
}
