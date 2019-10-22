import { server } from 'decentraland-server'
import Ajv from 'ajv'

import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { withAuthentication, withModelExists, AuthRequest } from '../middleware'
import { withModelAuthorization } from '../middleware/authorization'
import { Ownable } from '../Ownable'
import { Project } from '../Project'
import { ManifestAttributes, manifestSchema } from './Manifest.types'
import { S3Project, MANIFEST_FILENAME, POOL_FILENAME, ACL } from '../S3'

const ajv = new Ajv()

export class ManifestRouter extends Router {
  mount() {
    const withProjectExists = withModelExists(Project)
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
     * Returns the manifest of a pool
     */
    this.router.get(
      '/publics/:id/manifest',
      server.handleRequest(this.getPublicProjectManifest)
    )

    /**
     * Returns the manifest of a pool
     */
    this.router.get(
      '/pools/:id/manifest',
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
    const user_id = req.auth.sub

    const validator = ajv.compile(manifestSchema)
    validator(manifestJSON)

    if (validator.errors) {
      throw new HTTPError('Invalid schema', validator.errors)
    }

    const canUpsert = await new Ownable(Project).canUpsert(id, user_id)
    if (!canUpsert) {
      throw new HTTPError(
        'Unauthorized user',
        { id, user_id },
        STATUS_CODES.unauthorized
      )
    }

    const manifest = {
      ...manifestJSON,
      project: { ...manifestJSON.project, user_id }
    } as ManifestAttributes

    const [project] = await Promise.all([
      new Project(manifest.project).upsert(),
      new S3Project(id).saveFile(
        MANIFEST_FILENAME,
        JSON.stringify(manifest),
        ACL.private
      )
    ])
    return project
  }

  async deleteManifest(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    await new S3Project(id).deleteFile(MANIFEST_FILENAME)
    return true
  }
}
