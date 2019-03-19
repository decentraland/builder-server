import express = require('express')
import { server } from 'decentraland-server'

import { AuthRouter } from '../common'
import { readFile, parseFileBody } from '../S3'
import { decrypt } from '../crypto'
import { Entry } from './types'

export class AuthContestRouter extends AuthRouter {
  mount() {
    /**
     * Get entry by id
     */
    this.router.get('/entry/:projectId', server.handleRequest(this.getEntry))
  }

  async getEntry(req: express.Request): Promise<Entry> {
    const projectId = server.extractFromReq(req, 'projectId')
    let entry: Entry

    try {
      const file = await readFile(projectId)
      entry = parseFileBody(file)
    } catch (error) {
      throw new Error(`Unknown entry ${projectId}`)
    }

    entry.contest.email = await decrypt(entry.contest.email)

    if (entry.user.id) {
      entry.user.id = await decrypt(entry.user.id)
    }

    return entry
  }
}
