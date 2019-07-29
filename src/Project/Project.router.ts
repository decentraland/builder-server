import express = require('express')
import { server } from 'decentraland-server'
import Ajv from 'ajv'

import { Router } from '../common'
import { S3Project, checkFile, ACL, getProjectFileUploader } from '../S3'
import { Project } from './Project.model'
import { ProjectAttributes, projectSchema } from './Project.types'

const REQUIRED_FILE_FIELDS = ['thumb', 'north', 'east', 'south', 'west']

const ajv = new Ajv()

export class ProjectRouter extends Router {
  mount() {
    /**
     * Get all projects
     */
    this.router.get('/projects', server.handleRequest(this.upsertProject))

    /**
     * Upsert a new project
     */
    this.router.put('/projects/:id', server.handleRequest(this.upsertProject))

    /**
     * Get project
     */
    this.router.get('/projects/:id', server.handleRequest(this.getProject))

    /**
     * Upload a project attachment
     */
    this.router.post(
      '/projects/:id/media',
      this.getFileUploaderMiddleware(),
      server.handleRequest(this.uploadFiles)
    )

    /**
     * Delete project
     */
    this.router.delete(
      '/projects/:id',
      server.handleRequest(this.deleteProject)
    )
  }

  async getProjects() {
    // TODO: Wrap layout rows and cols?
    // TODO: Paginate
    return Project.find<ProjectAttributes[]>()
  }

  async getProject(req: express.Request) {
    const projectId = server.extractFromReq(req, 'id')
    const project = await Project.findOne(projectId)

    if (!project) {
      throw new Error(`Invalid project id ${projectId}`)
    }

    // TODO: Wrap layout rows and cols?
    return project
  }

  async upsertProject(req: express.Request) {
    const projectId = server.extractFromReq(req, 'id')
    const projectJSON = server.extractFromReq(req, 'project')

    const validator = ajv.compile(projectSchema)
    if (!validator(projectJSON)) {
      throw new Error(ajv.errorsText())
    }

    const attributes: ProjectAttributes = JSON.parse(projectJSON)

    if (projectId !== attributes.id) {
      throw new Error('The project id on the data and URL do not match')
    }

    return new S3Project(attributes).upsert()
  }

  getFileUploaderMiddleware() {
    const uploadFileFields = REQUIRED_FILE_FIELDS.map(fieldName => ({
      name: fieldName,
      maxCount: 1
    }))

    return getProjectFileUploader(ACL.publicRead, req =>
      server.extractFromReq(req, 'id')
    ).fields(uploadFileFields)
  }

  async uploadFiles(req: express.Request) {
    const uploadedFiles = Object.values(req.files)

    // Check if all files uploaded
    const uploadedFieldNames = Object.keys(req.files)
    const areFilesUploaded = REQUIRED_FILE_FIELDS.every(fieldName =>
      uploadedFieldNames.includes(fieldName)
    )

    if (!areFilesUploaded) {
      throw new Error('Required files not present in the upload')
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
    return S3Project.delete(id)
  }
}
