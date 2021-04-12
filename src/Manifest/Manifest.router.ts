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
     * Returns the manifest of a land associated project  (Builder In World)
     */
    this.router.get(
      '/projects/:land/manifestFromCoordinates',
      withAuthentication,
      server.handleRequest(this.getProjectManifestByCoordinates)
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

  async getProjectManifestByCoordinates(req: AuthRequest) {
    const created_location = server.extractFromReq(req, 'land')
    const eth_address = req.auth.ethAddress

    const project : any = await Project.findOne({
      created_location,
      eth_address,
      is_deleted: false,
    })
    if (project) {
      const body = await new S3Project(project.id).readFileBody(
        MANIFEST_FILENAME
      )
      if (body) {
        return JSON.parse(body.toString())
      }
    }
    return 'false'
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
