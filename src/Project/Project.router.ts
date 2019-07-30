import { server } from 'decentraland-server'
import Ajv from 'ajv'

import { Router } from '../common/Router'
import { HTTPError } from '../common/HTTPError'
import { auth, AuthRequest } from '../middleware/auth'
import { ManifestAttributes, manifestSchema } from '../Manifest'
import {
  saveManifest,
  deleteManifest,
  deleteProject,
  checkFile,
  ACL,
  getProjectFileUploader
} from '../S3'
import { Project } from './Project.model'
import { ProjectAttributes, projectSchema } from './Project.types'

const REQUIRED_FILE_FIELDS = ['thumb', 'north', 'east', 'south', 'west']

const ajv = new Ajv()

export class ProjectRouter extends Router {
  mount() {
    /**
     * Get all projects
     */
    this.router.get('/projects', auth, server.handleRequest(this.getProjects))

    /**
     * Get project
     */
    this.router.get(
      '/projects/:id',
      auth,
      server.handleRequest(this.getProject)
    )

    /**
     * Upsert a new project
     */
    this.router.put(
      '/projects/:id',
      auth,
      server.handleRequest(this.upsertProject)
    )

    /**
     * Delete project
     */
    this.router.delete(
      '/projects/:id',
      auth,
      server.handleRequest(this.deleteProject)
    )

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

    /**
     * Upload a project attachment
     */
    this.router.post(
      '/projects/:id/media',
      auth,
      this.getFileUploaderMiddleware(),
      server.handleRequest(this.uploadFiles)
    )
  }

  async getProjects(req: AuthRequest) {
    const user_id = req.auth.sub

    // TODO: Paginate
    return Project.find<ProjectAttributes>({ user_id })
  }

  async getProject(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const user_id = req.auth.sub

    if (!(await Project.isOwnedBy(id, user_id))) {
      throw new HTTPError('Invalid project id', { id, user_id })
    }

    return Project.findOne({ id, user_id })
  }

  async upsertProject(req: AuthRequest) {
    const id = server.extractFromReq(req, 'id')
    const projectJSON: any = server.extractFromReq(req, 'project')
    const user_id = req.auth.sub

    const validator = ajv.compile(projectSchema)
    if (!validator(projectJSON)) {
      throw new Error(ajv.errorsText())
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
    const user_id = req.auth.sub

    if (!(await Project.isOwnedBy(id, user_id))) {
      throw new HTTPError(`Invalid project id`, { id, user_id })
    }

    const [{ rowCount }] = await Promise.all([
      Project.delete({ id }),
      deleteProject(id)
    ])

    return { rowCount }
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
