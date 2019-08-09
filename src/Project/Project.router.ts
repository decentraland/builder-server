import { server } from 'decentraland-server'
import Ajv from 'ajv'

import { Router } from '../common/Router'
import { HTTPError } from '../common/HTTPError'
import { authentication, AuthRequest, projectExists } from '../middleware'
import { projectAuthorization } from '../middleware/authorization'
import { deleteProject, ACL, getProjectFileUploader } from '../S3'
import { Deployment } from '../Deployment'
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

const THUMBNAIL_FILE_NAME = 'thumbnail'
const FILE_NAMES = [
  THUMBNAIL_FILE_NAME,
  'preview',
  'north',
  'east',
  'south',
  'west'
]

const ajv = new Ajv()

export class ProjectRouter extends Router {
  mount() {
    /**
     * Get all projects
     */
    this.router.get(
      '/projects',
      authentication,
      server.handleRequest(this.getProjects)
    )

    /**
     * Get project
     */
    this.router.get(
      '/projects/:id',
      authentication,
      projectExists,
      projectAuthorization,
      server.handleRequest(this.getProject)
    )

    /**
     * Upsert a new project
     */
    this.router.put(
      '/projects/:id',
      authentication,
      projectAuthorization,
      server.handleRequest(this.upsertProject)
    )

    /**
     * Delete project
     */
    this.router.delete(
      '/projects/:id',
      authentication,
      projectExists,
      projectAuthorization,
      server.handleRequest(this.deleteProject)
    )

    /**
     * Upload a project attachment
     */
    this.router.post(
      '/projects/:id/media',
      authentication,
      projectExists,
      projectAuthorization,
      this.getFileUploaderMiddleware(),
      server.handleRequest(this.uploadFiles)
    )
  }

  async getProjects(req: AuthRequest) {
    const user_id = req.auth.sub

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

    const attributes = { ...projectJSON, user_id } as ProjectAttributes

    if (id !== attributes.id) {
      throw new HTTPError('The body and URL project ids do not match', {
        urlId: id,
        bodyId: attributes.id
      })
    }

    return new Project(attributes).upsert()
  }

  async uploadFiles(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')

    // req.files is an object with: { [fieldName]: Express.MulterS3.File[] }
    // The array is there because multer supports multiple files per field name, but we set the maxCount to 1
    // So the array will always have only one item on it
    // This transformation is for easier access of each file. The filed name is still accessible on each File
    const reqFiles = req.files as Record<string, Express.MulterS3.File[]>
    const files = Object.values(reqFiles).map(files => files[0])

    const thumbnail = files.find(file => file.fieldname === THUMBNAIL_FILE_NAME)
    if (thumbnail) {
      await Project.update({ thumbnail: thumbnail.location }, { id })
    }

    return true
  }

  async deleteProject(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')

    const [projectResult, deploymentResult] = await Promise.all([
      Project.delete({ id }),
      Deployment.delete({ id }),
      deleteProject(id)
    ])

    return { rowCount: projectResult.rowCount + deploymentResult.rowCount }
  }

  private getFileUploaderMiddleware() {
    const uploadFileFields = FILE_NAMES.map(fieldName => ({
      name: fieldName,
      maxCount: 1
    }))

    const getProjectId = async (req: AuthRequest) => {
      const id = server.extractFromReq(req, 'id')
      const user_id = req.auth.sub

      if (!(await Project.isOwnedBy(id, user_id))) {
        throw new HTTPError(`Invalid project id`, { id, user_id })
      }

      return id
    }

    return getProjectFileUploader(ACL.publicRead, getProjectId).fields(
      uploadFileFields
    )
  }
}
