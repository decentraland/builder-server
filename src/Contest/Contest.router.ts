import express = require('express')
import { server } from 'decentraland-server'

import { Router } from '../common'
import { uploadFile, readFile, checkFile } from '../S3'
import { encrypt, decrypt } from '../crypto'
import { Submission } from './types'
import { parseSubmission } from './validations'

export class ContestRouter extends Router {
  mount() {
    /**
     * Get submission by id
     */
    this.app.post(
      '/submission/:projectId',
      server.handleRequest(this.getSubmission)
    )

    /**
     * Returns all stored submissions
     */
    this.app.post('/submission', server.handleRequest(this.submitProject))
  }

  async getSubmission(req: express.Request): Promise<Submission> {
    const projectId = server.extractFromReq(req, 'projectId')

    const submission: Submission = await readFile(projectId)
    submission.contest.email = await decrypt(submission.contest.email)

    return submission
  }

  async submitProject(req: express.Request): Promise<boolean> {
    const submissionJSON = server.extractFromReq(req, 'submission')

    const submission = parseSubmission(submissionJSON)
    const projectId = submission.project.id

    submission.contest.email = await encrypt(submission.contest.email)

    await uploadFile(projectId, Buffer.from(JSON.stringify(submission)))
    await checkFile(projectId)

    return true
  }
}
