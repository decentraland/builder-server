import express = require('express')
import { server } from 'decentraland-server'

import { Router } from '../common'
import { uploadFile, readFile, checkFile, parseFileBody } from '../S3'
import { encrypt, decrypt } from '../crypto'
import { LegacyEntry } from './types'
import { parseEntry } from './validations'

export class ContestRouter extends Router {
  mount() {
    /**
     * Upload a new entry
     */
    this.router.post('/entry', server.handleRequest(this.submitProject))
  }

  async submitProject(req: express.Request): Promise<boolean> {
    const EntryJSON = server.extractFromReq(req, 'entry')

    const entry = parseEntry(EntryJSON)
    const projectId = entry.project.id

    let previousEntry: LegacyEntry | undefined

    // We need to check if a previous entry exists and if it has an user,
    // throw if it's different to the current entry's secret
    try {
      const file = await readFile(projectId)
      previousEntry = parseFileBody(file)
    } catch (error) {
      // No previous entity
    }

    if (previousEntry) {
      if (typeof previousEntry.user === 'undefined') {
        // Handle old entries
        const previousEmail = await decrypt(previousEntry.contest.email)
        if (previousEmail !== entry.contest.email) {
          throw new Error(
            "You can't update this entries email, please contact support"
          )
        }
      } else {
        const previousId = await decrypt(previousEntry.user.id)
        if (previousId !== entry.user.id) {
          throw new Error("New entry's secret doesn't match the previous one")
        }
      }
    }

    entry.contest.email = await encrypt(entry.contest.email)
    entry.user.id = await encrypt(entry.user.id)

    await uploadFile(projectId, Buffer.from(JSON.stringify(entry)))
    await checkFile(projectId)

    return true
  }
}
