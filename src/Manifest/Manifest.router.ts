import { server } from 'decentraland-server'
import Ajv from 'ajv'

import { Router } from '../common/Router'
import { HTTPError } from '../common/HTTPError'
import { authentication, AuthRequest, projectExists } from '../middleware'
import { projectAuthorization } from '../middleware/authorization'
import { Project } from '../Project'
import { ManifestAttributes, manifestSchema } from './Manifest.types'
import { saveManifest, deleteManifest, checkFile, readManifest } from '../S3'

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
      server.handleRequest(this.getManifest)
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

  async getManifest(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    return readManifest(id)
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

    const [projectExists, isOwner] = await Promise.all([
      Project.exists(id),
      Project.isOwnedBy(id, user_id)
    ])
    if (projectExists && !isOwner) {
      throw new Error(`Unauthorized user ${user_id} for project ${id}`)
    }

    const manifest = {
      ...manifestJSON,
      project: { ...manifestJSON.project, user_id }
    } as ManifestAttributes

    const [project] = await Promise.all([
      new Project(manifest.project).upsert(),
      saveManifest(id, manifest)
    ])
    return project
  }

  async deleteManifest(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    if (!(await checkFile(id))) {
      throw new HTTPError('The manifest does not exist', { id })
    }
    return deleteManifest(id)
  }
}
