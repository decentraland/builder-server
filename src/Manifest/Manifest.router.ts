import { server } from 'decentraland-server'
import { Request, Response } from 'express'

import { Router } from '../common/Router'
import { withCors, withPermissiveCors } from '../middleware/cors'
import { addInmutableCacheControlHeader } from '../common/headers'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { getValidator } from '../utils/validator'
import {
  withModelAuthorization,
  withAuthentication,
  withModelExists,
  AuthRequest,
} from '../middleware'
import { Ownable } from '../Ownable'
import { Project, TemplateStatus } from '../Project'
import {
  S3Project,
  MANIFEST_FILENAME,
  POOL_FILENAME,
  ACL,
  getBucketURL,
} from '../S3'
import { SearchableProject } from '../Project/SearchableProject'
import { ManifestAttributes, manifestSchema } from './Manifest.types'
import { collectStatistics } from './utils'

const validator = getValidator()

export class ManifestRouter extends Router {
  mount() {
    const withProjectExists = withModelExists(Project, 'id', {
      is_deleted: false,
    })
    const withPublishedProjectExists = withModelExists(Project)
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
    this.router.options('/pools/:id/manifest', withPermissiveCors)

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

    /**
     * Returns the manifest of a pool
     */
    this.router.get(
      '/publics/:id/manifest',
      withPermissiveCors,
      withProjectExists,
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

    /**
     * Returns the manifest of a pool
     */
    this.router.get(
      '/pools/:id/manifest',
      withPermissiveCors,
      withPublishedProjectExists,
      this.getPoolManifest
    )

    /**
     * Upserts the manifest and the project inside of it
     * Important! Project authorization is done inside the handler because the manifest upserts the project
     */
    this.router.put(
      '/projects/:id/manifest',
      withPermissiveCors,
      withAuthentication,
      server.handleRequest(this.upsertManifest)
    )

    /**
     * Upserts the manifest and the project inside of it
     */
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
    addInmutableCacheControlHeader(res)
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

  getPoolManifest = (req: Request, res: Response) => {
    const id = server.extractFromReq(req, 'id')
    const project = new S3Project(id)
    addInmutableCacheControlHeader(res)
    return res.redirect(
      `${getBucketURL()}/${project.getFileKey(POOL_FILENAME)}`,
      301
    )
  }

  async upsertManifest(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const manifestJSONMaybe: any = server.extractFromReq(req, 'manifest')
    const eth_address = req.auth.ethAddress
    const validate = validator.compile(manifestSchema)
    validate(manifestJSONMaybe)
    const manifestJSON: ManifestAttributes = manifestJSONMaybe

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
      project: { ...manifestJSON.project, id, eth_address },
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
