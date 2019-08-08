import { server } from 'decentraland-server'
import Ajv from 'ajv'

import { Router } from '../common/Router'
import { HTTPError } from '../common/HTTPError'
import { authentication, AuthRequest, projectExists } from '../middleware'
import { projectAuthorization } from '../middleware/authorization'
import { Project } from '../Project'
import { ManifestAttributes, manifestSchema } from './Manifest.types'
import { S3Project, MANIFEST_FILENAME, POOL_FILENAME } from '../S3'

const ajv = new Ajv()

export class ManifestRouter extends Router {
  mount() {
    /**
     * Returns the manifest of a project
     */
    this.router.get(
      '/projects/:id/manifest',
      authentication,
      projectExists,
      projectAuthorization,
      server.handleRequest(this.getProjectManifest)
    )

    /**
     * Returns the manifest of a pool
     */
    this.router.get(
      '/pools/:id/manifest',
      authentication,
      projectExists,
      projectAuthorization,
      server.handleRequest(this.getPoolManifest)
    )

    /**
     * Upserts the manifest and the project inside of it
     * Important! Project authorization is done inside the handler because the manifest upserts the project
     */
    this.router.put(
      '/projects/:id/manifest',
      authentication,
      server.handleRequest(this.upsertManifest)
    )

    /**
     * Upserts the manifest and the project inside of it
     */
    this.router.delete(
      '/projects/:id/manifest',
      authentication,
      projectAuthorization,
      server.handleRequest(this.deleteManifest)
    )
  }

  async getProjectManifest(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    return new S3Project(id).readFile(MANIFEST_FILENAME)
  }

  async getPoolManifest(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    return new S3Project(id).readFile(POOL_FILENAME)
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

    if (!(await Project.canUpsert(id, user_id))) {
      throw new HTTPError('Unauthorized user', { id, user_id })
    }

    const manifest = {
      ...manifestJSON,
      project: { ...manifestJSON.project, user_id }
    } as ManifestAttributes

    const [project] = await Promise.all([
      new Project(manifest.project).upsert(),
      new S3Project(id).saveManifest(MANIFEST_FILENAME, manifest)
    ])
    return project
  }

  async deleteManifest(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    await new S3Project(id).deleteFile(MANIFEST_FILENAME)
    return true
  }
}
