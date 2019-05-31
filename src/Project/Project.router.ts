import express = require('express')
import { server } from 'decentraland-server'

import { Router } from '../common'
import { encrypt, decrypt } from '../crypto'
import { checkFile } from '../S3'
import { readEntry, saveEntry, getFileUploader, EntryPrefix } from '../storage'
import { ProjectEntry } from './types'
import { parseEntry } from './validations'

const SUPPORTED_FILE_FIELDS = [
  'video',
  'thumb',
  'north',
  'east',
  'south',
  'west'
]

const uploadFileFields = SUPPORTED_FILE_FIELDS.map(fieldName => {
  return { name: fieldName, maxCount: 1 }
})

export class ProjectRouter extends Router {
  mount() {
    /**
     * Create a new project
     */
    this.router.post('/project', server.handleRequest(this.submitProject))

    /**
     * Upload a project attachment
     */
    this.router.post(
      '/project/:projectId/preview',
      this.submitPreview,
      getFileUploader(EntryPrefix.Project, 'public-read').fields(
        uploadFileFields
      ),
      server.handleRequest(this.filesUploaded)
    )
  }

  async submitProject(req: express.Request): Promise<boolean> {
    const entryJSON = server.extractFromReq(req, 'entry')

    const entry = parseEntry(entryJSON)
    const projectId = entry.project.id

    // We need to check if a previous entry exists and if it has an user,
    // throw if it's different to the current entry's secret
    let previousEntry: ProjectEntry = await readEntry(
      projectId,
      EntryPrefix.Project
    )

    if (previousEntry) {
      const previousId = await decrypt(previousEntry.user.id)
      if (previousId !== entry.user.id) {
        throw new Error("New entry's secret doesn't match the previous one")
      }
    }

    entry.user.email = await encrypt(entry.user.email)
    entry.user.id = await encrypt(entry.user.id)

    await saveEntry(projectId, entry, EntryPrefix.Project)

    return true
  }

  async submitPreview(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    const projectId = server.extractFromReq(req, 'projectId')

    // Check if project id exists
    const entry: ProjectEntry = await readEntry(projectId, EntryPrefix.Project)
    if (!entry) {
      return res.json({
        ok: false,
        data: {},
        error: 'Cannot add files to non-existing project'
      })
    }

    return next()
  }

  async filesUploaded(req: express.Request, _res: express.Response) {
    const uploadedFiles = Object.values(req.files)

    // Check if all files uploaded
    const areFilesUploaded = uploadedFiles
      .map(files => {
        const fieldName = files[0].fieldname
        return SUPPORTED_FILE_FIELDS.includes(fieldName)
      })
      .every(e => e === true)

    if (!areFilesUploaded) {
      return false
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
