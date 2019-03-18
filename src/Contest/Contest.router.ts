import express = require('express')
import { utils } from 'decentraland-commons'
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

    // omit secret when retrieving entry
    return utils.omit(entry, ['secret'])
  }

  async submitProject(req: express.Request): Promise<boolean> {
    const EntryJSON = server.extractFromReq(req, 'entry')

    const entry = parseEntry(EntryJSON)
    const projectId = entry.project.id

    try {
      // check if a previous entry exists
      const file = await readFile(projectId)
      if (file && file.Body) {
        // check if the previous entry has a secret, throw if it's different to the current entry's secret
        const previousEntry: Entry = JSON.parse(file.Body.toString())
        if (
          previousEntry &&
          typeof previousEntry.secret === 'string' &&
          previousEntry.secret !== entry.secret
        ) {
          throw new Error("New entry's secret doesn't match the previous one")
        }
      }
    } catch (e) {
      // there's not a previous entry
    }

    entry.contest.email = await encrypt(entry.contest.email)

    await uploadFile(projectId, Buffer.from(JSON.stringify(entry)))
    await checkFile(projectId)

    return true
  }
}
