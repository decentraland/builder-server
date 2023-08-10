import { Request, Response } from 'express'
import fs from 'fs'
import { server } from 'decentraland-server'
import mimeTypes from 'mime-types'
import path from 'path'
import { Router } from '../common/Router'
import { addInmutableCacheControlHeader } from '../common/headers'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { getValidator } from '../utils/validator'
import { withModelExists, withModelAuthorization } from '../middleware'
import {
  S3Content,
  S3Project,
  getBucketURL,
  getProjectManifest,
  getUploader,
  CRDT_FILENAME
} from '../S3'
import { withAuthentication, AuthRequest } from '../middleware/authentication'
import { Ownable } from '../Ownable'
import { SDK7Scene } from '../Scene/SDK7Scene'
import { CRDT_HASH, INDEX_HASH, PREVIEW_HASH } from '../Scene/utils'
import { Project } from './Project.model'
import { ProjectAttributes, projectSchema } from './Project.types'
import { SearchableProject } from './SearchableProject'

const BUILDER_SERVER_URL = process.env.BUILDER_SERVER_URL
const PEER_URL = process.env.PEER_URL

export const THUMBNAIL_FILE_NAME = 'thumbnail'
const FILE_NAMES = [
  THUMBNAIL_FILE_NAME,
  'preview',
  'north',
  'east',
  'south',
  'west',
]
const MIME_TYPES = ['image/png', 'image/jpeg']

const validator = getValidator()
const scenePreviewMain = fs.readFileSync('static/scene-preview.js.raw', 'utf-8')
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
     * Get all templates
     */
    this.router.get('/templates', server.handleRequest(this.getTemplates))

    /**
     * Get all projects
     */
    this.router.get(
      '/projects',
      withAuthentication,
      server.handleRequest(this.getProjects)
    )

    /**
     * Get project
     */
    this.router.get(
      '/projects/:id',
      withAuthentication,
      withProjectExists,
      withProjectAuthorization,
      server.handleRequest(this.getProject)
    )

    /**
     * Upsert a new project
     * Important! Project authorization is done inside the handler
     */
    this.router.put(
      '/projects/:id',
      withAuthentication,
      server.handleRequest(this.upsertProject)
    )

    /**
     * Delete project
     */
    this.router.delete(
      '/projects/:id',
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
      withAuthentication,
      server.handleRequest(this.removeCoordsFromProjects)
    )

    this.router.get(
      '/projects/:id/public',
      withProjectExistsAndIsPublic,
      server.handleRequest(this.getPublicProject)
    )

    /**
     * Get a project media attachment
     */
    this.router.get('/projects/:id/media/:filename', this.getMedia)

    /**
     * Upload a project media attachment
     */
    this.router.post(
      '/projects/:id/media',
      withAuthentication,
      withProjectExists,
      withProjectAuthorization,
      getUploader({
        mimeTypes: MIME_TYPES,
        getFileKey: async (file, req) => {
          const id = server.extractFromReq(req, 'id')
          const extension = mimeTypes.extension(file.mimetype)
          const filename = `${file.fieldname}.${extension}`

          // **Important** Shares folder with the other project files
          return new S3Project(id).getFileKey(filename)
        },
      }).fields(
        FILE_NAMES.map((name) => ({
          name,
          maxCount: 1,
        }))
      ),
      server.handleRequest(this.uploadFiles)
    )

    this.router.get(
      '/projects/:id/contents/:content',
      withProjectExists,
      this.getContents
    )

    this.router.get(
      '/projects/:id/about',
      withProjectExists,
      this.getPreviewAbout
    )

    this.router.put(
      '/projects/:id/crdt', 
      withAuthentication,
      withProjectExists,
      withProjectAuthorization,
      getUploader({
        getFileKey: async (_file, req) => {
          const id = server.extractFromReq(req, 'id')
          return new S3Project(id).getFileKey(CRDT_FILENAME)
        },
      }).any(),
      server.handleRequest(this.upsertCrdt)
    )

    this.router.get(
      '/projects/:id/crdt',
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

  async upsertProject(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const projectJSON: any = server.extractFromReq(req, 'project')
    const eth_address = req.auth.ethAddress

    const validate = validator.compile(projectSchema)
    validate(projectJSON)

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

    const attributes = { ...projectJSON, eth_address } as ProjectAttributes

    if (id !== attributes.id) {
      throw new HTTPError('The body and URL project ids do not match', {
        urlId: id,
        bodyId: attributes.id,
      })
    }

    return new Project(attributes).upsert()
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

  async uploadFiles(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')

    // req.files is an object with: { [fieldName]: Express.Multer.File[] }
    // The array is there because multer supports multiple files per field name, but we set the maxCount to 1
    // So the array will always have only one item on it
    // We cast req.files for easier access of each file. The field name is still accessible on each File
    const reqFiles = req.files as Record<string, Express.Multer.File[]>

    const files = Object.values(reqFiles).map((files) => files[0])

    const thumbnail = files.find(
      (file) => file.fieldname === THUMBNAIL_FILE_NAME
    )

    if (thumbnail) {
      const extension = mimeTypes.extension(thumbnail.mimetype)
      await Project.update(
        { thumbnail: `${THUMBNAIL_FILE_NAME}.${extension}` },
        { id }
      )
    }

    return true
  }

  async getContents(req: Request, res: Response) {
    const projectId = server.extractFromReq(req, 'id')
    const content = server.extractFromReq(req, 'content')

    if (content === INDEX_HASH) {
      return res.send(scenePreviewMain)
    }

    // when content is preview, return entity object
    if (content === PREVIEW_HASH) {
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

        // Add composite file
        entity.content = [
          { file: "bin/index.js", hash: INDEX_HASH },
          { file: "main.crdt", hash: CRDT_HASH },
          ...entity.content,
        ]

        return res.json(entity)
      } catch(error) {
        return res
          .status(STATUS_CODES.notFound)
          .send(server.sendError({ projectId }, (error as Error)?.message))
      }
    }

    // when content is crdt, return scene crdt file
    if (content === CRDT_HASH) {
      const redirectPath = `${getBucketURL()}/${new S3Project(projectId).getFileKey(CRDT_FILENAME)}`
      return res.redirect(301, redirectPath)
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
          `urn:decentraland:entity:${PREVIEW_HASH}?=&baseUrl=${BUILDER_SERVER_URL}/v1/projects/${projectId}/contents/`
        ]
      },
      content: {
        healthy: true,
        publicUrl: `${PEER_URL}/content`
      },
      lambdas: {
        healthy: true,
        publicUrl: `${PEER_URL}/lambdas`
      },
      comms: {
        healthy: true,
        protocol: "v3",
        fixedAdapter: "offline:offline"
      }
    })
  }

  async upsertCrdt(_req: AuthRequest) {
    return true
  }

  async getCrdt(req: Request, res: Response) {
    const id = server.extractFromReq(req, 'id')

    return res.redirect(
      `${getBucketURL()}/${(new S3Project(id)).getFileKey(CRDT_FILENAME)}`,
      301
    )
  }
}
