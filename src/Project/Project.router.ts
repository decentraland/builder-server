import { Request, Response } from 'express'
import { server } from 'decentraland-server'
import mimeTypes from 'mime-types'
import path from 'path'

import { Router } from '../common/Router'
import { addInmutableCacheControlHeader } from '../common/headers'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { getValidator } from '../utils/validator'
import { withModelExists, withModelAuthorization } from '../middleware'
import { S3Project, getFileUploader, ACL, getBucketURL } from '../S3'
import { withAuthentication, AuthRequest } from '../middleware/authentication'
import { Ownable } from '../Ownable'
import { Project } from './Project.model'
import { ProjectAttributes, projectSchema } from './Project.types'
import { SearchableProject } from './SearchableProject'

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
      this.getFileUploaderMiddleware(),
      server.handleRequest(this.uploadFiles)
    )
  }

  async getProjects(req: AuthRequest) {
    const eth_address = req.auth.ethAddress
    const projectSearcher = new SearchableProject(req)
    return projectSearcher.searchByEthAddress(eth_address)
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
      `${getBucketURL()}/${project.getFileKey(filename)}`,
      301
    )
  }

  async uploadFiles(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')

    // req.files is an object with: { [fieldName]: Express.MulterS3.File[] }
    // The array is there because multer supports multiple files per field name, but we set the maxCount to 1
    // So the array will always have only one item on it
    // We cast req.files for easier access of each file. The field name is still accessible on each File
    const reqFiles = req.files as Record<string, Express.MulterS3.File[]>
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

  private getFileUploaderMiddleware() {
    const uploader = getFileUploader(
      { acl: ACL.publicRead, mimeTypes: MIME_TYPES },
      (req, file) => {
        const id = server.extractFromReq(req, 'id')

        const extension = mimeTypes.extension(file.mimetype)
        const filename = `${file.fieldname}.${extension}`

        // **Important** Shares folder with the other project files
        return new S3Project(id).getFileKey(filename)
      }
    )

    const uploadFileFields = FILE_NAMES.map((fieldName) => ({
      name: fieldName,
      maxCount: 1,
    }))

    return uploader.fields(uploadFileFields)
  }
}
