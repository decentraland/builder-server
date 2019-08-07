import { server } from 'decentraland-server'
import Ajv from 'ajv'

import { Router } from '../common/Router'
import { HTTPError } from '../common/HTTPError'
import { authentication, AuthRequest, projectExists } from '../middleware'
import { projectAuthorization } from '../middleware/authorization'
import { Deployment } from '../Deployment'
import { deleteProject, checkFile, ACL, getProjectFileUploader } from '../S3'
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

const REQUIRED_FILE_FIELDS = ['thumb', 'north', 'east', 'south', 'west']

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
    // TODO: const user_id = req.auth.sub

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
    const uploadedFiles = Object.values(req.files)

    // Check if all files uploaded
    const uploadedFieldNames = Object.keys(req.files)
    const areFilesUploaded = REQUIRED_FILE_FIELDS.every(fieldName =>
      uploadedFieldNames.includes(fieldName)
    )

    if (!areFilesUploaded) {
      throw new HTTPError('Required files not present in the upload', {
        requiredFields: REQUIRED_FILE_FIELDS,
        uploadedFieldNames
      })
    }

    // Check files exist in bucket
    const checks = await Promise.all(
      uploadedFiles.map(files => {
        const file = files[0]
        return checkFile(file.key)
      })
    )

    return checks.every(check => check === true)
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
    const uploadFileFields = REQUIRED_FILE_FIELDS.map(fieldName => ({
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
