import express = require('express')
import { server } from 'decentraland-server'
import Ajv from 'ajv'

import { Router } from '../common/Router'
import { HTTPError } from '../common/HTTPError'
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
    this.router.get('/projects', server.handleRequest(this.getProjects))

    /**
     * Get project
     */
    this.router.get('/projects/:id', server.handleRequest(this.getProject))

    /**
     * Upsert a new project
     */
    this.router.put('/projects/:id', server.handleRequest(this.upsertProject))

    /**
     * Delete project
     */
    this.router.delete(
      '/projects/:id',
      server.handleRequest(this.deleteProject)
    )

    /**
     * Upserts the manifest and the project inside of it
     */
    this.router.put(
      '/projects/:id/manifest',
      server.handleRequest(this.upsertManifest)
    )

    /**
     * Upserts the manifest and the project inside of it
     */
    this.router.delete(
      '/projects/:id/manifest',
      server.handleRequest(this.deleteManifest)
    )

    /**
     * Upload a project attachment
     */
    this.router.post(
      '/projects/:id/media',
      this.getFileUploaderMiddleware(),
      server.handleRequest(this.uploadFiles)
    )
  }

  async getProjects() {
    // TODO: Wrap layout rows and cols?
    // TODO: Paginate
    return Project.find<ProjectAttributes[]>()
  }

  async getProject(req: express.Request) {
    const id = server.extractFromReq(req, 'id')
    const project = await Project.findOne(id)

    if (!project) {
      throw new HTTPError('Invalid project id', id)
    }

    // TODO: Wrap layout rows and cols?
    return project
  }

  async upsertProject(req: express.Request) {
    const id = server.extractFromReq(req, 'id')
    const projectJSON = server.extractFromReq(req, 'project') as any

    const validator = ajv.compile(projectSchema)
    if (!validator(projectJSON)) {
      throw new Error(ajv.errorsText())
    }

    const attributes = projectJSON as ProjectAttributes

    if (id !== attributes.id) {
      throw new HTTPError('The body and URL project ids do not match', {
        urlId: id,
        bodyId: attributes.id
      })
    }

    return new Project(attributes).upsert()
  }

  async uploadFiles(req: express.Request) {
    const uploadedFiles = Object.values(req.files)

    // Check if all files uploaded
    const uploadedFieldNames = Object.keys(req.files)
    const areFilesUploaded = REQUIRED_FILE_FIELDS.every(fieldName =>
      uploadedFieldNames.includes(fieldName)
    )

    if (!areFilesUploaded) {
      throw new HTTPError('Required files not present in the upload', {
        requiredFields: REQUIRED_FILE_FIELDS
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

  async deleteProject(req: express.Request) {
    const id = server.extractFromReq(req, 'id')
    return Promise.all([Project.delete({ id }), deleteProject(id)])
  }

  async upsertManifest(req: express.Request) {
    const id = server.extractFromReq(req, 'id')
    const manifestJSON = server.extractFromReq(req, 'manifest') as any

    const validator = ajv.compile(manifestSchema)
    validator(manifestJSON)

    if (validator.errors) {
      throw new HTTPError('Invalid schema', validator.errors)
    }

    const manifest = manifestJSON as ManifestAttributes

    return Promise.all([
      new Project(manifest.project).upsert(),
      saveManifest(id, manifest)
    ])
  }

  async deleteManifest(req: express.Request) {
    const id = server.extractFromReq(req, 'id')
    return deleteManifest(id)
  }

  private getFileUploaderMiddleware() {
    const uploadFileFields = REQUIRED_FILE_FIELDS.map(fieldName => ({
      name: fieldName,
      maxCount: 1
    }))

    return getProjectFileUploader(ACL.publicRead, req =>
      server.extractFromReq(req, 'id')
    ).fields(uploadFileFields)
  }
}
