import express = require('express')
import { server } from 'decentraland-server'
import Ajv from 'ajv'

import { Router } from '../common'
import { saveManifest } from '../S3'
import { ManifestAttributes, manifestSchema } from './Manifest.types'
import { Project, ProjectAttributes } from '../Project'

const ajv = new Ajv()

export class ManifestRouter extends Router {
  mount() {
    /**
     * Upserts the manifest resources
     */
    this.router.post('/manifests', server.handleRequest(this.upsertManfiest))
  }

  async upsertManfiest(req: express.Request): Promise<boolean> {
    const manifestJSON = server.extractFromReq(req, 'manifest')

    const validator = ajv.compile(manifestSchema)
    if (!validator(manifestJSON)) {
      throw new Error(ajv.errorsText())
    }

    const manifest: ManifestAttributes = JSON.parse(manifestJSON)
    const project: ProjectAttributes = manifest.project

    await Promise.all([
      new Project(project).upsert(),
      saveManifest(project.id, manifest)
    ])

    return true
  }
}
