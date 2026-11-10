import { Request, Response } from 'express'
import { server } from 'decentraland-server'
import path from 'path'
import { Router } from '../common/Router'
import { withCors, withPermissiveCors } from '../middleware/cors'
import { addInmutableCacheControlHeader } from '../common/headers'
import { STATUS_CODES } from '../common/HTTPError'
import { withModelExists, withModelAuthorization } from '../middleware'
import {
  S3Content,
  S3Project,
  getBucketURL,
  getProjectManifest,
  CRDT_FILENAME,
} from '../S3'
import { withAuthentication, AuthRequest } from '../middleware/authentication'
import { SDK7Scene } from '../Scene/SDK7Scene'
import { CRDT_HASH, ENTITY_HASH } from '../Scene/utils'
import { Project } from './Project.model'
import { SearchableProject } from './SearchableProject'

const BUILDER_SERVER_URL = process.env.BUILDER_SERVER_URL
const PEER_URL = process.env.PEER_URL

const THUMBNAIL_FILE_NAME = 'thumbnail'
const FILE_NAMES = [
  THUMBNAIL_FILE_NAME,
  'preview',
  'north',
  'east',
  'south',
  'west',
]

export class ProjectRouter extends Router {
  mount() {
    const withProjectExists = withModelExists(Project, 'id', {
      is_deleted: false,
    })
    const withProjectExistsAndIsPublic = withModelExists(Project, 'id', {
      is_public: true,
      is_deleted: false,
    })
    const withProjectAuthorization = withModelAuthorization(Project)

    /**
     * CORS for the OPTIONS header
     */
    this.router.options('/templates', withCors)
    this.router.options('/projects', withCors)
    this.router.options('/projects/:id', withCors)
    this.router.options('/projects/:coords/coords', withCors)
    this.router.options('/projects/:id/public', withCors)
    this.router.options('/projects/:id/media/:filename', withPermissiveCors)
    this.router.options('/projects/:id/contents/:content', withPermissiveCors)
    this.router.options('/projects/:id/about', withCors)
    this.router.options('/projects/:id/crdt', withPermissiveCors)

    /**
     * Get all templates
     */
    this.router.get(
      '/templates',
      withCors,
      server.handleRequest(this.getTemplates)
    )

    /**
     * Get all projects
     */
    this.router.get(
      '/projects',
      withCors,
      withAuthentication,
      server.handleRequest(this.getProjects)
    )

    /**
     * Get project
     */
    this.router.get(
      '/projects/:id',
      withCors,
      withAuthentication,
      withProjectExists,
      withProjectAuthorization,
      server.handleRequest(this.getProject)
    )

    /**
     * Delete project
     */
    this.router.delete(
      '/projects/:id',
      withCors,
      withAuthentication,
      withProjectExists,
      withProjectAuthorization,
      server.handleRequest(this.deleteProject)
    )

    /**
     * Update all projects with coords to null
     */
    this.router.delete(
      '/projects/:coords/coords',
      withCors,
      withAuthentication,
      server.handleRequest(this.removeCoordsFromProjects)
    )

    this.router.get(
      '/projects/:id/public',
      withCors,
      withProjectExistsAndIsPublic,
      server.handleRequest(this.getPublicProject)
    )

    /**
     * Get a project media attachment
     */
    this.router.get(
      '/projects/:id/media/:filename',
      withPermissiveCors,
      this.getMedia
    )

    this.router.get(
      '/projects/:id/contents/:content',
      withPermissiveCors,
      withProjectExists,
      this.getContents
    )

    this.router.get(
      '/projects/:id/about',
      withCors,
      withProjectExists,
      this.getPreviewAbout
    )

    this.router.get(
      '/projects/:id/crdt',
      withPermissiveCors,
      withAuthentication,
      withProjectExists,
      withProjectAuthorization,
      this.getCrdt
    )
  }

  async getProjects(req: AuthRequest) {
    const eth_address = req.auth.ethAddress

    const projectSearcher = new SearchableProject(req)

    return projectSearcher.searchByEthAddress(eth_address)
  }

  async getTemplates(req: Request) {
    const projectSearcher = new SearchableProject(req)

    return projectSearcher.searchByIsTemplate()
  }

  async getProject(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const eth_address = req.auth.ethAddress
    return Project.findOne({ id, eth_address, is_deleted: false })
  }

  async getPublicProject(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    return Project.findOne({ id, is_public: true, is_deleted: false })
  }

  async deleteProject(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    await Project.update({ updated_at: new Date(), is_deleted: true }, { id })
    return true
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

  async getMedia(req: Request, res: Response) {
    const id = server.extractFromReq(req, 'id')
    const filename = server.extractFromReq(req, 'filename')
    const project = new S3Project(id)

    const basename = filename.replace(path.extname(filename), '')

    if (!FILE_NAMES.includes(basename)) {
      return res
        .status(404)
        .json(server.sendError({ filename }, 'Invalid filename'))
    }

    addInmutableCacheControlHeader(res)
    return res.redirect(
      301,
      `${getBucketURL()}/${project.getFileKey(filename)}`
    )
  }

  async getContents(req: Request, res: Response) {
    const projectId = server.extractFromReq(req, 'id')
    const content = server.extractFromReq(req, 'content')

    // when content is preview, return entity object
    if (content === ENTITY_HASH) {
      try {
        const { scene, project } = await getProjectManifest(projectId)
        if (scene.sdk6) {
          return res
            .status(STATUS_CODES.badRequest)
            .send(
              server.sendError(
                { projectId: project.id },
                "Can't preview projects with sdk6 scene"
              )
            )
        }

        const entity = await new SDK7Scene(scene.sdk7).getEntity(project)

        // Add crdt file
        entity.content = [
          { file: 'main.crdt', hash: CRDT_HASH },
          ...entity.content,
        ]

        return res.json(entity)
      } catch (error) {
        return res
          .status(STATUS_CODES.notFound)
          .send(server.sendError({ projectId }, (error as Error)?.message))
      }
    }

    // when content is crdt, return scene crdt file
    if (content === CRDT_HASH) {
      const redirectPath = `${getBucketURL()}/${new S3Project(
        projectId
      ).getFileKey(CRDT_FILENAME)}`
      return res.redirect(302, redirectPath)
    }

    // redirect to content in s3
    const ts = req.query.ts as string
    const redirectPath = `${getBucketURL()}/${new S3Content().getFileKey(
      content
    )}${ts ? `?ts=${ts}` : ''}`

    return res.redirect(301, redirectPath)
  }

  async getPreviewAbout(req: Request, res: Response) {
    const projectId = server.extractFromReq(req, 'id')
    return res.json({
      healthy: true,
      acceptingUsers: true,
      configurations: {
        globalScenesUrn: [],
        scenesUrn: [
          `urn:decentraland:entity:${ENTITY_HASH}?=&baseUrl=${BUILDER_SERVER_URL}/v1/projects/${projectId}/contents/`,
        ],
        minimap: {
          enabled: false,
        },
        skybox: {
          fixedHour: 36000,
        },
        realmName: `web-editor-${projectId.split('-').slice(-1)}`,
      },
      content: {
        healthy: true,
        publicUrl: `${PEER_URL}/content`,
      },
      lambdas: {
        healthy: true,
        publicUrl: `${PEER_URL}/lambdas`,
      },
      comms: {
        healthy: true,
        protocol: 'v3',
        fixedAdapter: 'offline:offline',
      },
    })
  }

  async getCrdt(req: Request, res: Response) {
    const id = server.extractFromReq(req, 'id')

    return res.redirect(
      `${getBucketURL()}/${new S3Project(id).getFileKey(CRDT_FILENAME)}`,
      302
    )
  }
}
