import express = require('express')
import { server } from 'decentraland-server'
import Ajv from 'ajv'

import { Router } from '../common'
import { checkFile } from '../S3'
import { getFileUploader, EntryPrefix } from '../storage'
import { Project } from './Project.model'
import { ProjectAttributes, projectSchema } from './Project.types'

const REQUIRED_FILE_FIELDS = ['thumb', 'north', 'east', 'south', 'west']
const OPTIONAL_FILE_FIELDS = ['video']
const SUPPORTED_FILE_FIELDS = [...REQUIRED_FILE_FIELDS, ...OPTIONAL_FILE_FIELDS]

const uploadFileFields = SUPPORTED_FILE_FIELDS.map(fieldName => {
  return { name: fieldName, maxCount: 1 }
})

const ajv = new Ajv()

export class ProjectRouter extends Router {
  mount() {
    /**
     * Upsert a new project
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
      '/projects/:projectId/preview',
      getFileUploader(EntryPrefix.Project, 'public-read').fields(
        uploadFileFields
      ),
      server.handleRequest(this.filesUploaded)
    )
  }

  async getProjects() {
    // TODO: Wrap layout rows and cols?
    // TODO: Paginate
    return Project.find()
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
    const projectId = server.extractFromReq(req, 'project')
    const projectJSON = server.extractFromReq(req, 'project')

    const validator = ajv.compile(projectSchema)
    if (!validator(projectJSON)) {
      throw new Error(ajv.errorsText())
    }

    const attributes: ProjectAttributes = JSON.parse(projectJSON)

    if (projectId !== attributes.id) {
      throw new Error('The project id on the data and URL do not match')
    }

    return new Project(attributes).upsert()
  }

  async filesUploaded(req: express.Request, _res: express.Response) {
    const uploadedFiles = Object.values(req.files)

    // Check if all files uploaded
    const uploadedFieldNames = Object.keys(req.files)
    const areFilesUploaded = REQUIRED_FILE_FIELDS.every(fieldName => {
      return uploadedFieldNames.includes(fieldName)
    })

    if (!areFilesUploaded) {
      throw new Error('Required files not present in the upload')
    }

    // Check files exist in bucket
    const results = await Promise.all(
      uploadedFiles.map(files => {
        const file = files[0]
        return checkFile(file.key)
      })
    )

    return results.every(e => e === true)
  }
}
