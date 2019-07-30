import express = require('express')
import { server } from 'decentraland-server'
import Ajv from 'ajv'

import { Router } from '../common/Router'
import { HTTPError } from '../common/HTTPError'
import { S3Manifest, readManifest } from '../S3'
import { ManifestAttributes, manifestSchema } from './Manifest.types'

const ajv = new Ajv()

/**
 * Keep in mind that the Manifest Id it's **the same** as the project id
 */
export class ManifestRouter extends Router {
  mount() {
    /**
     * Upserts the manifest resources
     */
    this.router.put('/manifests/:id', server.handleRequest(this.upsertManfiest))

    /**
     * Delete the manifest resources
     */
    this.router.delete(
      '/manifests/:id',
      server.handleRequest(this.deleteManfiest)
    )
  }

  async upsertManfiest(req: express.Request) {
    const manifestId = server.extractFromReq(req, 'id')
    const manifestJSON = server.extractFromReq(req, 'manifest') as any

    const validator = ajv.compile(manifestSchema)
    validator(manifestJSON)

    if (validator.errors) {
      throw new HTTPError('Invalid schema', validator.errors)
    }

    const manifest = manifestJSON as ManifestAttributes

    return new S3Manifest(manifestId, manifest).upsert()
  }

  async deleteManfiest(req: express.Request) {
    const manifestId = server.extractFromReq(req, 'id')

    const manifest: ManifestAttributes | undefined = await readManifest(
      manifestId
    )

    if (!manifest) {
      throw new HTTPError('Invalid manifest id', manifestId)
    }

    return new S3Manifest(manifestId, manifest).delete()
  }
}
