import express = require('express')
import { server } from 'decentraland-server'

import { Router } from '../common'
import { uploadFile, readFile, checkFile } from '../S3'
import { encrypt, decrypt } from '../crypto'
import { Entry } from './types'
import { parseEntry } from './validations'

export class ContestRouter extends Router {
  mount() {
    /**
     * Get entry by id
     */
    this.router.get('/entry/:projectId', server.handleRequest(this.getEntry))

    /**
     * Upload a new entry
     */
    this.router.post('/entry', server.handleRequest(this.submitProject))
  }

  async getEntry(req: express.Request): Promise<Entry> {
    const projectId = server.extractFromReq(req, 'projectId')

    const file = await readFile(projectId)

    if (!file.Body) {
      throw new Error(`Unknown entry ${projectId}`)
    }

    const entry: Entry = JSON.parse(file.Body.toString())
    entry.contest.email = await decrypt(entry.contest.email)

    return entry
  }

  async submitProject(req: express.Request): Promise<boolean> {
    const EntryJSON = server.extractFromReq(req, 'entry')

    const entry = parseEntry(EntryJSON)
    const projectId = entry.project.id

    entry.contest.email = await encrypt(entry.contest.email)

    await uploadFile(projectId, Buffer.from(JSON.stringify(entry)))
    await checkFile(projectId)

    return true
  }
}
