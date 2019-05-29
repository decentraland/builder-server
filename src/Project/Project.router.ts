import express = require('express')
import { server } from 'decentraland-server'

import { Router } from '../common'
import { encrypt, decrypt } from '../crypto'
import { readEntry, saveEntry, getUploader, EntryPrefix } from '../storage'
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
    this.router.post(
      '/project/:projectId/preview',
      server.handleRequest(this.submitPreview),
      getUploader().array('', 2)
    )
  }

  async submitProject(req: express.Request): Promise<boolean> {
    const EntryJSON = server.extractFromReq(req, 'entry')

    const entry = parseEntry(EntryJSON)
    const projectId = entry.project.id

    // We need to check if a previous entry exists and if it has an user,
    // throw if it's different to the current entry's secret
    let previousEntry: Entry = await readEntry(projectId, EntryPrefix.Project)

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

  async submitPreview(req: express.Request): Promise<boolean> {
    const projectId = server.extractFromReq(req, 'projectId')
    console.log(projectId)
    // Check if project id exists

    return true
  }
}
