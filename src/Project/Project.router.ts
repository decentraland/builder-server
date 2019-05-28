import express = require('express')
import { server } from 'decentraland-server'

import { Router } from '../common'
import { encrypt, decrypt } from '../crypto'
import { uploadFile, checkFile } from '../S3'
import { readEntry } from '../storage'
import { Entry } from './types'
import { parseEntry } from './validations'

export class ProjectRouter extends Router {
  mount() {
    /**
     * Create a new project
     */
    this.router.post('/project', server.handleRequest(this.submitProject))

    /**
     * Upload a project attachment
     */
    // this.router.post(
    //   '/project/:projectId/preview',
    //   server.handleRequest(this.submitPreview)
    // )
  }

  async submitProject(req: express.Request): Promise<boolean> {
    const EntryJSON = server.extractFromReq(req, 'entry')

    const entry = parseEntry(EntryJSON)
    const projectId = entry.project.id

    // We need to check if a previous entry exists and if it has an user,
    // throw if it's different to the current entry's secret
    let previousEntry: Entry = await readEntry(projectId)

    if (previousEntry) {
      const previousId = await decrypt(previousEntry.user.id)
      if (previousId !== entry.user.id) {
        throw new Error("New entry's secret doesn't match the previous one")
      }
    }

    entry.user.email = await encrypt(entry.user.email)
    entry.user.id = await encrypt(entry.user.id)

    await uploadFile(projectId, Buffer.from(JSON.stringify(entry)))
    await checkFile(projectId)

    return true
  }

  // async submitPreview(req: express.Request): Promise<boolean> {
  //   return true
  // }
}
