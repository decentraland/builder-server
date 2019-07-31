import { server } from 'decentraland-server'
import Ajv from 'ajv'

import { Router } from '../common/Router'
import { HTTPError } from '../common/HTTPError'
import { auth, AuthRequest } from '../middleware/auth'
import { Project } from '../Project'
import { ManifestAttributes, manifestSchema } from './Manifest.types'
import { saveManifest, deleteManifest, checkFile } from '../S3'

const ajv = new Ajv()

export class ManifestRouter extends Router {
  mount() {
    /**
     * Upserts the manifest and the project inside of it
     */
    this.router.put(
      '/projects/:id/manifest',
      auth,
      server.handleRequest(this.upsertManifest)
    )

    /**
     * Upserts the manifest and the project inside of it
     */
    this.router.delete(
      '/projects/:id/manifest',
      auth,
      server.handleRequest(this.deleteManifest)
    )
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
