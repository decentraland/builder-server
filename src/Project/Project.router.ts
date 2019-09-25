import { Request, Response } from 'express'
import { server } from 'decentraland-server'
import Ajv from 'ajv'
import mimeTypes from 'mime-types'
import path from 'path'

import { Router } from '../common/Router'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { withAuthentication, withModelExists, AuthRequest } from '../middleware'
import { withModelAuthorization } from '../middleware/authorization'
import { S3Project, getFileUploader, ACL } from '../S3'
import { Ownable } from '../Ownable'
import { Deployment } from '../Deployment'
import { Pool } from '../Pool'
import { RequestParameters } from '../RequestParameters'
import {
  SearchableModel,
  SearchableParameters,
  SearchableConditions
} from '../Searchable'
import { Project } from './Project.model'
import {
  ProjectAttributes,
  projectSchema,
  searchableProjectProperties
} from './Project.types'

export const THUMBNAIL_FILE_NAME = 'thumbnail'
const FILE_NAMES = [
  THUMBNAIL_FILE_NAME,
  'preview',
  'north',
  'east',
  'south',
  'west'
]
const MIME_TYPES = ['image/png', 'image/jpeg']

const ajv = new Ajv()

export class ProjectRouter extends Router {
  mount() {
    const withProjectExists = withModelExists(Project)
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
     * Get a project media attachment
     */
    this.router.get(
      '/projects/:id/media/:filename',
      withProjectExists,
      this.getMedia
    )

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
    const user_id = req.auth.sub

    // TODO: This is the same code as Pool.router#getPools
    const requestParameters = new RequestParameters(req)
    const searchableProject = new SearchableModel<ProjectAttributes>(
      Project.tableName
    )
    const parameters = new SearchableParameters<ProjectAttributes>(
      requestParameters,
      { sort: { by: searchableProjectProperties } }
    )
    const conditions = new SearchableConditions<ProjectAttributes>(
      requestParameters,
      { eq: searchableProjectProperties }
    )
    conditions.addExtras('eq', { user_id })

    return searchableProject.search(parameters, conditions)
  }

  async getProject(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const user_id = req.auth.sub
    return Project.findOne({ id, user_id })
  }

  async upsertProject(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const projectJSON: any = server.extractFromReq(req, 'project')
    const user_id = req.auth.sub

    const validator = ajv.compile(projectSchema)
    validator(projectJSON)

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

    const attributes = { ...projectJSON, user_id } as ProjectAttributes

    if (id !== attributes.id) {
      throw new HTTPError('The body and URL project ids do not match', {
        urlId: id,
        bodyId: attributes.id
      })
    }

    return new Project(attributes).upsert()
  }

  async deleteProject(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')

    await Promise.all([
      new S3Project(id).delete(),
      Deployment.delete({ id }),
      Pool.delete({ id }),
      Project.delete({ id })
    ])

    return true
  }

  async getMedia(req: Request, res: Response) {
    const id = server.extractFromReq(req, 'id')
    const filename = server.extractFromReq(req, 'filename')

    const basename = filename.replace(path.extname(filename), '')

    if (!FILE_NAMES.includes(basename)) {
      return res
        .status(404)
        .json(server.sendError({ filename }, 'Invalid filename'))
    }

    const file = await new S3Project(id).readFileBody(filename)
    if (!file) {
      return res
        .status(404)
        .json(
          server.sendError(
            { id, filename },
            'File does not exist in that project'
          )
        )
    }

    res.setHeader('Content-Type', mimeTypes.lookup(basename) || '')
    return res.end(file)
  }

  async uploadFiles(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')

    // req.files is an object with: { [fieldName]: Express.MulterS3.File[] }
    // The array is there because multer supports multiple files per field name, but we set the maxCount to 1
    // So the array will always have only one item on it
    // We cast req.files for easier access of each file. The field name is still accessible on each File
    const reqFiles = req.files as Record<string, Express.MulterS3.File[]>
    const files = Object.values(reqFiles).map(files => files[0])

    const thumbnail = files.find(file => file.fieldname === THUMBNAIL_FILE_NAME)

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

    const uploadFileFields = FILE_NAMES.map(fieldName => ({
      name: fieldName,
      maxCount: 1
    }))

    return uploader.fields(uploadFileFields)
  }
}
